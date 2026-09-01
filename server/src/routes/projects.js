import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

const VALID_CATEGORIES = ['收入相关', '基础能力', '支撑后端', '拟取消'];
const VALID_STAGES = ['勘察设计阶段', '项目实施阶段', '工程验收阶段', '终验归档阶段'];

router.get('/projects/:code', async (req, res) => {
  try {
    const pool = getPool();
    const [projects] = await pool.query(
      'SELECT * FROM projects WHERE project_code = ?',
      [req.params.code]
    );
    if (!projects.length) return res.status(404).json({ error: '项目不存在' });
    const [progress] = await pool.query(
      `SELECT report_date, progress, purchase_rate, disclosure,
              arrival_rate, online_handover, final_acceptance
       FROM weekly_progress WHERE project_code = ? ORDER BY report_date DESC`,
      [req.params.code]
    );
    res.json({ project: projects[0], progress });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

router.put('/projects/:code', async (req, res) => {
  try {
    const { category, stage, demand_dept, demand_room, demand_owner, content } = req.body || {};
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `分类必须是：${VALID_CATEGORIES.join('、')}` });
    }
    if (stage !== undefined && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: `项目阶段必须是：${VALID_STAGES.join('、')}` });
    }
    const pool = getPool();
    // 只允许修改分类、项目阶段、需求部门/室/责任人、建设内容，其他字段一律忽略
    const sets = [];
    const params = [];
    if (category !== undefined) { sets.push('category = ?'); params.push(category); }
    if (stage !== undefined) { sets.push('stage = ?'); params.push(stage); }
    if (demand_dept !== undefined) { sets.push('demand_dept = ?'); params.push(demand_dept); }
    if (demand_room !== undefined) { sets.push('demand_room = ?'); params.push(demand_room); }
    if (demand_owner !== undefined) { sets.push('demand_owner = ?'); params.push(demand_owner); }
    if (content !== undefined) { sets.push('content = ?'); params.push(content); }
    if (sets.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }
    params.push(req.params.code);
    const [r] = await pool.query(
      `UPDATE projects SET ${sets.join(', ')} WHERE project_code = ?`,
      params
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: '项目不存在' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `更新失败：${e.message}` });
  }
});

// 置顶：pin_order = 当前最大值 + 1（新置顶排在置顶组末尾）
router.put('/projects/:code/pin', async (req, res) => {
  try {
    const pool = getPool();
    const [cur] = await pool.query(
      'SELECT pin_order FROM projects WHERE project_code = ?',
      [req.params.code]
    );
    if (!cur.length) return res.status(404).json({ error: '项目不存在' });
    if (cur[0].pin_order !== null) return res.status(409).json({ error: '该项目已置顶' });
    const [[m]] = await pool.query(
      'SELECT COALESCE(MAX(pin_order), 0) + 1 AS n FROM projects'
    );
    await pool.query('UPDATE projects SET pin_order = ? WHERE project_code = ?', [
      m.n, req.params.code,
    ]);
    res.json({ ok: true, pin_order: m.n });
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

// 取消置顶
router.delete('/projects/:code/pin', async (req, res) => {
  try {
    const pool = getPool();
    const [cur] = await pool.query(
      'SELECT pin_order FROM projects WHERE project_code = ?',
      [req.params.code]
    );
    if (!cur.length) return res.status(404).json({ error: '项目不存在' });
    if (cur[0].pin_order === null) return res.status(404).json({ error: '该项目未置顶' });
    await pool.query(
      'UPDATE projects SET pin_order = NULL WHERE project_code = ?',
      [req.params.code]
    );
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

// 调整置顶顺序：与相邻的置顶项目交换 pin_order；到边界则不变
router.put('/projects/:code/pin/move', async (req, res) => {
  try {
    const dir = req.body?.direction;
    if (dir !== 'up' && dir !== 'down') {
      return res.status(400).json({ error: "direction 必须是 'up' 或 'down'" });
    }
    const pool = getPool();
    const [cur] = await pool.query(
      'SELECT pin_order FROM projects WHERE project_code = ?',
      [req.params.code]
    );
    if (!cur.length) return res.status(404).json({ error: '项目不存在' });
    const myOrder = cur[0].pin_order;
    if (myOrder === null) return res.status(400).json({ error: '该项目未置顶' });
    const [nb] = dir === 'up'
      ? await pool.query(
          `SELECT project_code, pin_order FROM projects
           WHERE pin_order IS NOT NULL AND pin_order < ?
           ORDER BY pin_order DESC LIMIT 1`,
          [myOrder]
        )
      : await pool.query(
          `SELECT project_code, pin_order FROM projects
           WHERE pin_order IS NOT NULL AND pin_order > ?
           ORDER BY pin_order LIMIT 1`,
          [myOrder]
        );
    if (!nb.length) return res.json({ ok: true }); // 已在边界，顺序不变
    await pool.query('UPDATE projects SET pin_order = ? WHERE project_code = ?', [
      nb[0].pin_order, req.params.code,
    ]);
    await pool.query('UPDATE projects SET pin_order = ? WHERE project_code = ?', [
      myOrder, nb[0].project_code,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `操作失败：${e.message}` });
  }
});

export default router;
