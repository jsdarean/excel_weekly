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
    const { category, stage, demand_dept, demand_room, demand_owner } = req.body || {};
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `分类必须是：${VALID_CATEGORIES.join('、')}` });
    }
    if (stage !== undefined && !VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: `项目阶段必须是：${VALID_STAGES.join('、')}` });
    }
    const pool = getPool();
    // 只允许修改分类、项目阶段和需求部门/室/责任人，其他字段一律忽略
    const sets = [];
    const params = [];
    if (category !== undefined) { sets.push('category = ?'); params.push(category); }
    if (stage !== undefined) { sets.push('stage = ?'); params.push(stage); }
    if (demand_dept !== undefined) { sets.push('demand_dept = ?'); params.push(demand_dept); }
    if (demand_room !== undefined) { sets.push('demand_room = ?'); params.push(demand_room); }
    if (demand_owner !== undefined) { sets.push('demand_owner = ?'); params.push(demand_owner); }
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

export default router;
