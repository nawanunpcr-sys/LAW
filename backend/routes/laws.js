// ============================================
// routes/laws.js - API สำหรับทะเบียนกฎหมาย
// ============================================
const express = require('express');
const router  = express.Router();
const pool    = require('../config/database');
const { body, query, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');

// ── GET /api/laws - ดึงรายการกฎหมายทั้งหมด ──
router.get('/', async (req, res) => {
  try {
    const {
      category,
      status    = 'active',
      search    = '',
      page      = 1,
      limit     = 10,
      sort      = 'published_date',
      order     = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let whereClause = 'WHERE l.status = $1';
    params.push(status);

    if (category && category !== 'all') {
      params.push(category);
      whereClause += ` AND l.category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (
        l.title ILIKE $${params.length} OR 
        l.law_code ILIKE $${params.length} OR
        l.summary ILIKE $${params.length}
      )`;
    }

    // ดึงข้อมูลพร้อมแผนกที่เกี่ยวข้อง
    const lawsQuery = `
      SELECT 
        l.*,
        ARRAY_AGG(DISTINCT d.code) FILTER (WHERE d.code IS NOT NULL) AS departments,
        COUNT(ca.id) AS total_requirements,
        COUNT(CASE WHEN ca.status = 'compliant' THEN 1 END) AS compliant_count
      FROM laws l
      LEFT JOIN law_departments ld ON l.id = ld.law_id
      LEFT JOIN departments d ON ld.department_id = d.id
      LEFT JOIN compliance_assessments ca ON l.id = ca.law_id
      ${whereClause}
      GROUP BY l.id
      ORDER BY l.${sort} ${order}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(parseInt(limit), offset);

    const countQuery = `
      SELECT COUNT(DISTINCT l.id) 
      FROM laws l ${whereClause}
    `;

    const [lawsResult, countResult] = await Promise.all([
      pool.query(lawsQuery, params),
      pool.query(countQuery, params.slice(
