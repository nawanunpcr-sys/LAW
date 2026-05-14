// ============================================
// server.js - จุดเริ่มต้นของ Backend
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────
app.use(helmet());
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ──────────────────────────────────
app.use('/api/laws',          require('./routes/laws'));
app.use('/api/assessment',    require('./routes/assessment'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/auth',          require('./routes/auth'));

// ── Health Check ────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SHE Compliance API กำลังทำงาน',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ── Auto Scraper Schedule ───────────────────
// ดึงข้อมูลราชกิจจานุเบกษาทุก 6 ชั่วโมง
const scraperService = require('./services/scraperService');

cron.schedule('0 */6 * * *', async () => {
  console.log('⏰ [CRON] เริ่มดึงข้อมูลกฎหมายใหม่...');
  try {
    await scraperService.scrapeRatchakitcha();
    await scraperService.scrapeLabourDept();
    console.log('✅ [CRON] ดึงข้อมูลสำเร็จ');
  } catch (error) {
    console.error('❌ [CRON] ดึงข้อมูลล้มเหลว:', error.message);
  }
});

// ── Error Handler ────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'เกิดข้อผิดพลาดภายในระบบ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ── Start Server ─────────────────────────────
app.listen(PORT, () => {
  console.log(`
  SHE Compliance API พร้อมใช้งาน
  URL: http://localhost:${PORT}
  Environment: ${process.env.NODE_ENV}
  `);
});

module.exports = app;
