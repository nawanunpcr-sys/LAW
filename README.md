# SHE Compliance Manager
ระบบจัดการทะเบียนกฎหมายความปลอดภัย อาชีวอนามัย 
และสิ่งแวดล้อม สำหรับเจ้าหน้าที่ความปลอดภัย (จป.)

## วิธีติดตั้ง (Quick Start)

### ความต้องการของระบบ
- Node.js v18+
- PostgreSQL 15+
- npm หรือ yarn

### ขั้นตอนการติดตั้ง

# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/she-compliance-app.git
cd she-compliance-app

# 2. ติดตั้ง Backend
cd backend
npm install
cp ../.env.example .env
# แก้ไขไฟล์ .env ตามการตั้งค่าของคุณ

# 3. ติดตั้ง Frontend
cd ../frontend
npm install

# 4. ตั้งค่า Database
cd ../database
psql -U postgres -f schema.sql
psql -U postgres -d she_compliance -f seed.sql

# 5. รันระบบ
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev

## Features หลัก
- ทะเบียนกฎหมาย พรบ. กรมสวัสดิการแรงงาน
- ดึงข้อมูลอัตโนมัติจากราชกิจจานุเบกษา
- วิเคราะห์กฎหมาย (ใคร/ทำอะไร/ที่ไหน/อย่างไร)
- ประเมินความสอดคล้อง + Dashboard
- ส่งงานไปยังแผนกที่เกี่ยวข้อง
- แจ้งเตือนกฎหมายใหม่และกำหนดส่ง

## Tech Stack
| ส่วน | เทคโนโลยี |
|------|-----------|
| Frontend | HTML/CSS/JS + Tailwind CSS |
| Backend | Node.js + Express.js |
| Database | PostgreSQL |
| Scraping | Puppeteer + Cheerio |
| Notifications | Nodemailer + LINE Notify |
| Scheduler | node-cron |

## ติดต่อ
จัดทำโดย: [NAWANUN]
องค์กร: [PHKKU]
