import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 关注项目列表（含每个项目的详细进展，时间倒序）
router.get('/watched', async (req, res) => {
  try {
    const pool = getPool();
    const [watched] = await pool.query(
      `SELECT w.project_code, p.project_name, p.category
       FROM watched_projects w
       LEFT JOIN projects p ON p.project_code = w.project_code
       ORDER BY w.id`
    );
    if (!watched.length) return res.json({ watched: [] });
    // 自动把项目列表中的周进展同步到关注进展表（副本，不覆盖手工录入）
    await pool.query(
      `INSERT IGNORE INTO watch_progress (project_code, report_date, detail, source)
       SELECT w.project_code, wp.report_date, wp.progress, 'weekly'
       FROM watched_projects w
       JOIN weekly_progress wp ON wp.project_code = w.project_code
       WHERE wp.progress IS NOT NULL AND TRIM(wp.progress) <> ''`
    );
    const codes = watched.map((w) => w.project_code);
    const [progress] = await pool.query(
      `SELECT id, project_code, report_date, detail
       FROM watch_progress
       WHERE project_code IN (?)
       ORDER BY report_date DESC, id DESC`,
      [codes]
    );
    const byCode = new Map();
    for (const p of progress) {
      if (!byCode.has(p.project_code)) byCode.set(p.project_code, []);
      byCode.get(p.project_code).push(p);
    }
    res.json({
      watched: watched.map((w) => ({ ...w, progress: byCode.get(w.project_code) || [] })),
    });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

// 关注
router.post('/watched', async (req, res) => {
  try {
    const code = String(req.body?.code ?? '').trim();
    if (!code) return res.status(400).json({ error: '项目编码不能为空' });
    const pool = getPool();
    const [p] = await pool.query('SELECT 1 AS x FROM projects WHERE project_code = ?', [code]);
    if (!p.length) return res.status(404).json({ error: '项目不存在' });
    const [w] = await pool.query('SELECT 1 AS x FROM watched_projects WHERE project_code = ?', [code]);
    if (w.length) return res.status(409).json({ error: '该项目已在关注列表中' });
    const [r] = await pool.query('INSERT INTO watched_projects (project_code) VALUES (?)', [code]);
    // 把该项目已有的周进展复制一份到关注项目进展表（不覆盖手工录入的进展）
    await pool.query(
      `INSERT IGNORE INTO watch_progress (project_code, report_date, detail, source)
       SELECT project_code, report_date, progress, 'weekly'
       FROM weekly_progress
       WHERE project_code = ? AND progress IS NOT NULL AND TRIM(progress) <> ''`,
      [code]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

// 取消关注（连带删除该项目的详细进展）
router.delete('/watched/:code', async (req, res) => {
  try {
    const pool = getPool();
    const [r] = await pool.query('DELETE FROM watched_projects WHERE project_code = ?', [req.params.code]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '未关注该项目' });
    await pool.query('DELETE FROM watch_progress WHERE project_code = ?', [req.params.code]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

function validateProgress(body) {
  if (!DATE_RE.test(body?.report_date ?? '')) return '时间缺失或格式非法（需 YYYY-MM-DD）';
  if (!String(body?.detail ?? '').trim()) return '详细进展不能为空';
  return null;
}

// 录入进展
router.post('/watched/:code/progress', async (req, res) => {
  try {
    const err = validateProgress(req.body);
    if (err) return res.status(400).json({ error: err });
    const pool = getPool();
    const [w] = await pool.query('SELECT 1 AS x FROM watched_projects WHERE project_code = ?', [req.params.code]);
    if (!w.length) return res.status(404).json({ error: '未关注该项目' });
    const [dup] = await pool.query(
      'SELECT 1 AS x FROM watch_progress WHERE project_code = ? AND report_date = ?',
      [req.params.code, req.body.report_date]
    );
    if (dup.length) return res.status(409).json({ error: '该周的详细进展已录入过' });
    const [r] = await pool.query(
      "INSERT INTO watch_progress (project_code, report_date, detail, source) VALUES (?, ?, ?, 'manual')",
      [req.params.code, req.body.report_date, String(req.body.detail).trim()]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

// 编辑进展
router.put('/watched/progress/:id', async (req, res) => {
  try {
    const err = validateProgress(req.body);
    if (err) return res.status(400).json({ error: err });
    const pool = getPool();
    const [exists] = await pool.query('SELECT id FROM watch_progress WHERE id = ?', [req.params.id]);
    if (!exists.length) return res.status(404).json({ error: '进展记录不存在' });
    await pool.query(
      "UPDATE watch_progress SET report_date = ?, detail = ?, source = 'manual' WHERE id = ?",
      [req.body.report_date, String(req.body.detail).trim(), req.params.id]
    );
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

// 删除进展
router.delete('/watched/progress/:id', async (req, res) => {
  try {
    const [r] = await getPool().query('DELETE FROM watch_progress WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '进展记录不存在' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

export default router;
