import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/reports', async (req, res) => {
  try {
    const pool = getPool();
    let reportDate = req.query.report_date || null;
    if (!reportDate) {
      const [r] = await pool.query(
        'SELECT MAX(report_date) AS d FROM weekly_progress'
      );
      reportDate = r[0].d;
      if (!reportDate) return res.json({ reportDate: null, rows: [] });
    }
    const conds = [];
    const params = [reportDate];
    if (req.query.category) {
      conds.push('p.category = ?');
      params.push(req.query.category);
    }
    if (req.query.owner) {
      conds.push('p.owner = ?');
      params.push(req.query.owner);
    }
    if (req.query.stage) {
      conds.push('p.stage = ?');
      params.push(req.query.stage);
    }
    if (req.query.keyword) {
      conds.push('(p.project_code LIKE ? OR p.project_name LIKE ? OR p.demand_dept LIKE ?)');
      const kw = `%${req.query.keyword}%`;
      params.push(kw, kw, kw);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT p.id, p.project_code, p.category_major, p.project_name,
              p.approval_date, p.category, p.owner, p.budget_wan, p.stage,
              p.content, p.demand_dept, p.demand_room, p.demand_owner,
              p.pin_order,
              w.report_date, w.progress, w.purchase_rate, w.disclosure,
              w.arrival_rate, w.online_handover, w.final_acceptance
       FROM projects p
       LEFT JOIN weekly_progress w
         ON w.project_code = p.project_code AND w.report_date = ?
       ${where}
       ORDER BY p.pin_order IS NULL, p.pin_order,
                FIELD(p.category, '收入相关', '基础能力', '支撑后端', '拟取消') = 0,
                FIELD(p.category, '收入相关', '基础能力', '支撑后端', '拟取消'),
                p.approval_date IS NULL, p.approval_date DESC,
                p.project_code`,
      params
    );
    res.json({ reportDate, rows });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

router.get('/report-dates', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT DISTINCT report_date FROM weekly_progress ORDER BY report_date DESC'
    );
    res.json({ dates: rows.map((r) => r.report_date) });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

router.get('/filters', async (req, res) => {
  try {
    const pool = getPool();
    const [cats] = await pool.query(
      "SELECT DISTINCT category FROM projects WHERE category IS NOT NULL AND category <> '' ORDER BY category"
    );
    const [owners] = await pool.query(
      "SELECT DISTINCT owner FROM projects WHERE owner IS NOT NULL AND owner <> '' ORDER BY owner"
    );
    const [stages] = await pool.query(
      "SELECT DISTINCT stage FROM projects WHERE stage IS NOT NULL AND stage <> '' ORDER BY stage"
    );
    res.json({
      categories: cats.map((r) => r.category),
      owners: owners.map((r) => r.owner),
      stages: stages.map((r) => r.stage),
    });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

export default router;
