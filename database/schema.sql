-- ============================================
-- schema.sql - โครงสร้างฐานข้อมูล
-- ============================================

CREATE DATABASE she_compliance;
\c she_compliance;

-- Extension สำหรับ UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ตารางผู้ใช้งาน (จป.) ──────────────────
CREATE TABLE users (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(50) DEFAULT 'safety_officer',
  department  VARCHAR(100),
  line_token  VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── ตารางกฎหมาย (Law Registry) ────────────
CREATE TABLE laws (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  law_code        VARCHAR(50) UNIQUE,           -- รหัสกฎหมาย เช่น OHS-2024-12
  title           VARCHAR(500) NOT NULL,         -- ชื่อกฎหมายภาษาไทย
  title_short     VARCHAR(200),                  -- ชื่อย่อ
  category        VARCHAR(50) NOT NULL,          -- safety / env / health / fire
  source          VARCHAR(200),                  -- ราชกิจจานุเบกษา / กรมสวัสดิการฯ
  gazette_vol     VARCHAR(50),                   -- เล่มที่
  gazette_page    VARCHAR(50),                   -- ตอนที่
  published_date  DATE,                          -- วันที่ประกาศ
  effective_date  DATE,                          -- วันที่มีผลบังคับใช้
  summary         TEXT,                          -- สรุปย่อ
  full_text       TEXT,                          -- เนื้อหาเต็ม
  source_url      VARCHAR(500),                  -- URL ต้นฉบับ
  status          VARCHAR(30) DEFAULT 'active',  -- active / revised / repealed
  sync_status     VARCHAR(30) DEFAULT 'manual',  -- automated / manual / pending
  is_priority     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── ตารางข้อกำหนดย่อย (Breakdown) ─────────
CREATE TABLE law_requirements (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  law_id          UUID REFERENCES laws(id) ON DELETE CASCADE,
  section         VARCHAR(100),          -- มาตรา/ข้อที่
  who_must_comply TEXT,                  -- ใครต้องปฏิบัติ
  what_to_do      TEXT,                  -- ต้องทำอะไร
  where_applies   TEXT,                  -- ที่ไหน / พื้นที่ใด
  how_to_comply   TEXT,                  -- อย่างไร / วิธีการ
  related_docs    TEXT[],                -- เอกสารที่เกี่ยวข้อง
  deadline_type   VARCHAR(50),           -- รายปี / รายไตรมาส / ครั้งเดียว
  penalty         TEXT,                  -- บทลงโทษ
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── ตารางแผนก ──────────────────────────────
CREATE TABLE departments (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,  -- SAFETY / PROD / HR / ENV
  name        VARCHAR(100) NOT NULL,        -- ชื่อแผนก
  manager     VARCHAR(100),                 -- หัวหน้าแผนก
  email       VARCHAR(150),                 -- อีเมลแผนก
  line_token  VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── ตารางความสัมพันธ์กฎหมาย-แผนก ──────────
CREATE TABLE law_departments (
  law_id        UUID REFERENCES laws(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  relevance     VARCHAR(30) DEFAULT 'required', -- required / advisory
  PRIMARY KEY (law_id, department_id)
);

-- ── ตารางประเมินความสอดคล้อง ───────────────
CREATE TABLE compliance_assessments (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  law_id            UUID REFERENCES laws(id),
  department_id     UUID REFERENCES departments(id),
  assessed_by       UUID REFERENCES users(id),
  requirement_id    UUID REFERENCES law_requirements(id),
  status            VARCHAR(30) NOT NULL,
    -- compliant / non_compliant / partial / not_applicable
  evidence          TEXT,             -- หลักฐานที่มี
  notes             TEXT,             -- หมายเหตุ
  corrective_action TEXT,             -- แนวทางแก้ไข
  due_date          DATE,             -- กำหนดแก้ไข
  assessed_date     DATE DEFAULT NOW(),
  next_review_date  DATE,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ── ตารางงาน/Task ที่ส่งไปแผนก ─────────────
CREATE TABLE tasks (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  task_code       VARCHAR(50) UNIQUE,
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  law_id          UUID REFERENCES laws(id),
  requirement_id  UUID REFERENCES law_requirements(id),
  assigned_to_dept UUID REFERENCES departments(id),
  assigned_by     UUID REFERENCES users(id),
  priority        VARCHAR(20) DEFAULT 'medium',  -- high / medium / low
  status          VARCHAR(30) DEFAULT 'pending', -- pending / in_progress / done
  due_date        DATE,
  completed_date  DATE,
  attachments     TEXT[],
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── ตารางการแจ้งเตือน ───────────────────────
CREATE TABLE notifications (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type        VARCHAR(50),          -- new_law / deadline / task_assigned
  title       VARCHAR(300),
  message     TEXT,
  recipient   UUID REFERENCES users(id),
  dept_id     UUID REFERENCES departments(id),
  is_read     BOOLEAN DEFAULT FALSE,
  sent_via    TEXT[],               -- email / line / system
  law_id      UUID REFERENCES laws(id),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Indexes สำหรับเพิ่มความเร็ว ────────────
CREATE INDEX idx_laws_category    ON laws(category);
CREATE INDEX idx_laws_status      ON laws(status);
CREATE INDEX idx_laws_published   ON laws(published_date DESC);
CREATE INDEX idx_assess_law       ON compliance_assessments(law_id);
CREATE INDEX idx_assess_dept      ON compliance_assessments(department_id);
CREATE INDEX idx_tasks_dept       ON tasks(assigned_to_dept);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_notif_recipient  ON notifications(recipient);
