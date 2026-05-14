// ============================================
// scraperService.js
// บริการดึงข้อมูลกฎหมายจากเว็บภาครัฐ
//
// ⚠️ หมายเหตุสำคัญ:
// ควรตรวจสอบ robots.txt และ Terms of Service
// ของแต่ละเว็บไซต์ก่อนใช้งานจริง
// url: https://ratchakitcha.soc.go.th/robots.txt
// ============================================

const puppeteer = require('puppeteer');
const cheerio   = require('cheerio');
const axios     = require('axios');
const pool      = require('../config/database');

class ScraperService {

  // ── ดึงข้อมูลจากราชกิจจานุเบกษา ───────────
  async scrapeRatchakitcha() {
    console.log('🔍 กำลังดึงข้อมูลจากราชกิจจานุเบกษา...');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 SHE-Compliance-Bot/1.0 (Academic Research)'
      );

      // ── ค้นหาหมวดหมู่ความปลอดภัย ────────────
      const searchKeywords = [
        'ความปลอดภัย อาชีวอนามัย',
        'วัตถุอันตราย',
        'สิ่งแวดล้อม',
        'แรงงาน'
      ];

      const results = [];

      for (const keyword of searchKeywords) {
        try {
          const searchUrl = `${process.env.RATCHAKITCHANUBEKSA_URL}/search?q=${encodeURIComponent(keyword)}&type=law`;
          await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });

          const html = await page.content();
          const laws = this._parseRatchakitchaHTML(html, keyword);
          results.push(...laws);

          // หน่วงเวลาเพื่อไม่ให้โหลดเซิร์ฟเวอร์มากเกินไป
          await this._delay(2000);

        } catch (err) {
          console.warn(`⚠️ ไม่สามารถดึงข้อมูล keyword "${keyword}":`, err.message);
        }
      }

      // ── บันทึกลงฐานข้อมูล ───────────────────
      let savedCount = 0;
      for (const law of results) {
        const saved = await this._saveLawToDatabase(law, 'ราชกิจจานุเบกษา');
        if (saved) savedCount++;
      }

      console.log(`✅ ราชกิจจานุเบกษา: บันทึกกฎหมายใหม่ ${savedCount} รายการ`);
      return { success: true, count: savedCount };

    } catch (error) {
      console.error('❌ scrapeRatchakitcha error:', error.message);
      throw error;
    } finally {
      await browser.close();
    }
  }

  // ── ดึงข้อมูลจากกรมสวัสดิการแรงงาน ─────────
  async scrapeLabourDept() {
    console.log('🔍 กำลังดึงข้อมูลจากกรมสวัสดิการแรงงาน...');

    try {
      // ใช้ API หรือ RSS Feed ถ้ามีให้บริการ
      // (แนะนำให้ติดต่อหน่วยงานเพื่อขอข้อมูลอย่างเป็นทางการ)
      const response = await axios.get(
        `${process.env.LABOUR_DEPT_URL}/laws/safety`,
        {
          headers: {
            'User-Agent': 'SHE-Compliance-Bot/1.0 (Academic Research)',
            'Accept': 'application/json, text/html'
          },
          timeout: 15000
        }
      );

      const $ = cheerio.load(response.data);
      const laws = [];

      // ดึงรายชื่อกฎหมายจากตาราง
      $('table.law-table tr, .law-item').each((i, el) => {
        const title = $(el).find('.law-title, td:first-child').text().trim();
        const date  = $(el).find('.law-date, td:nth-child(2)').text().trim();
        const url   = $(el).find('a').attr('href');

        if (title && title.length > 10) {
          laws.push({
            title,
            published_date: this._parseThaiDate(date),
            source_url: url ? `${process.env.LABOUR_DEPT_URL}${url}` : null,
            category: this._categorizeByTitle(title)
          });
        }
      });

      let savedCount = 0;
      for (const law of laws) {
        const saved = await this._saveLawToDatabase(law, 'กรมสวัสดิการแรงงาน');
        if (saved) savedCount++;
      }

      console.log(`✅ กรมสวัสดิการฯ: บันทึกกฎหมายใหม่ ${savedCount} รายการ`);
      return { success: true, count: savedCount };

    } catch (error) {
      console.error('❌ scrapeLabourDept error:', error.message);
      // ไม่ throw เพื่อให้ cron ทำงานต่อได้
      return { success: false, error: error.message };
    }
  }

  // ── PRIVATE: แปลง HTML ราชกิจจานุเบกษา ─────
  _parseRatchakitchaHTML(html, keyword) {
    const $ = cheerio.load(html);
    const laws = [];

    // ปรับ selector ตามโครงสร้างจริงของเว็บ
    $('.gazette-item, .search-result-item').each((i, el) => {
      const title     = $(el).find('.title, h3, h4').text().trim();
      const vol       = $(el).find('.gazette-vol, .vol').text().trim();
      const date      = $(el).find('.publish-date, .date').text().trim();
      const url       = $(el).find('a').attr('href');
      const summary   = $(el).find('.summary, p').first().text().trim();

      if (title && title.length > 5) {
        laws.push({
          title,
          gazette_vol: vol,
          published_date: this._parseThaiDate(date),
          source_url: url,
          summary: summary.substring(0, 500),
          category: this._categorizeByTitle(title),
          keyword_match: keyword
        });
      }
    });

    return laws;
  }

  // ── PRIVATE: บันทึกกฎหมายลง DB ──────────────
  async _saveLawToDatabase(lawData, source) {
    try {
      // ตรวจสอบว่ามีแล้วหรือยัง (ป้องกัน duplicate)
      const existing = await pool.query(
        'SELECT id FROM laws WHERE title = $1 AND source = $2',
        [lawData.title, source]
      );

      if (existing.rows.length > 0) {
        return false; // มีแล้ว ไม่บันทึกซ้ำ
      }

      // สร้างรหัสกฎหมาย
      const lawCode = await this._generateLawCode(lawData.category);

      await pool.query(
        `INSERT INTO laws 
          (law_code, title, category, source, gazette_vol, 
           published_date, summary, source_url, status, sync_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 'automated')`,
        [
          lawCode,
          lawData.title,
          lawData.category || 'safety',
          source,
          lawData.gazette_vol || null,
          lawData.published_date || null,
          lawData.summary || null,
          lawData.source_url || null,
        ]
      );

      // ส่งแจ้งเตือนกฎหมายใหม่
      await this._notifyNewLaw(lawData.title, lawCode);

      return true;

    } catch (err) {
      console.error('❌ บันทึกกฎหมายล้มเหลว:', err.message);
      return false;
    }
  }

  // ── PRIVATE: จำแนกหมวดหมู่จากชื่อกฎหมาย ────
  _categorizeByTitle(title) {
    const safetyKeywords = ['ความปลอดภัย', 'อาชีวอนามัย', 'PPE', 'สุขอนามัย'];
    const envKeywords    = ['สิ่งแวดล้อม', 'มลพิษ', 'ของเสีย', 'น้ำทิ้ง'];
    const fireKeywords   = ['อัคคีภัย', 'ดับเพลิง', 'ไฟไหม้', 'ระบบไฟ'];
    const healthKeywords = ['สุขภาพ', 'โรค', 'สาธารณสุข'];

    if (safetyKeywords.some(k => title.includes(k))) return 'safety';
    if (envKeywords.some(k => title.includes(k)))    return 'env';
    if (fireKeywords.some(k => title.includes(k)))   return 'fire';
    if (healthKeywords.some(k => title.includes(k))) return 'health';
    return 'safety'; // default
  }

  // ── PRIVATE: แปลงวันที่ไทย → ISO ────────────
  _parseThaiDate(thaiDateStr) {
    if (!thaiDateStr) return null;
    try {
      const thaiMonths = {
        'มกราคม': '01', 'กุมภาพันธ์': '02', 'มีนาคม': '03',
        'เมษายน': '04', 'พฤษภาคม': '05',  'มิถุนายน': '06',
        'กรกฎาคม': '07','สิงหาคม': '08',  'กันยายน': '09',
        'ตุลาคม': '10', 'พฤศจิกายน': '11', 'ธันวาคม': '12'
      };
      // รูปแบบ: "1 มกราคม 2567"
      const match = thaiDateStr.match(/(\d+)\s+(\S+)\s+(\d+)/);
      if (!match) return null;
      const [, day, monthThai, yearBE] = match;
      const month   = thaiMonths[monthThai];
      const yearCE  = parseInt(yearBE) - 543;
      if (!month) return null;
      return `${yearCE}-${month}-${day.padStart(2, '0')}`;
    } catch {
      return null;
    }
  }

  // ── PRIVATE: สร้างรหัสกฎหมาย ────────────────
  async _generateLawCode(category) {
    const prefixes = {
      safety: 'OHS', env: 'ENV',
      health: 'HLT', fire: 'FIRE'
    };
    const prefix = prefixes[category] || 'LAW';
    const year   = new Date().getFullYear() + 543;
    const { rows } = await pool.query(
      "SELECT COUNT(*) FROM laws WHERE law_code LIKE $1",
      [`${prefix}-${year}-%`]
    );
    const seq = String(parseInt(rows[0].count) + 1).padStart(3, '0');
    return `${prefix}-${year}-${seq}`;
  }

  // ── PRIVATE: แจ้งเตือนกฎหมายใหม่ ────────────
  async _notifyNewLaw(title, lawCode) {
    try {
      await pool.query(
        `INSERT INTO notifications 
          (type, title, message, sent_via)
         VALUES ('new_law', $1, $2, ARRAY['system'])`,
        [
          `กฎหมายใหม่: ${lawCode}`,
          `พบกฎหมายใหม่: "${title.substring(0, 100)}" กรุณาตรวจสอบและวิเคราะห์`
        ]
      );
    } catch (err) {
      console.warn('⚠️ แจ้งเตือนล้มเหลว:', err.message);
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ScraperService();
