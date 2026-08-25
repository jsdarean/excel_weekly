import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

// 分类自定义顺序：收入相关 → 基础能力 → 支撑后端 → 拟取消
const CATEGORY_ORDER = ['收入相关', '基础能力', '支撑后端', '拟取消'];

router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const currYear = new Date().getFullYear();
    const prevYear = currYear - 1;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM projects');
    const [[{ budgetSum }]] = await pool.query(
      'SELECT COALESCE(SUM(budget_wan), 0) AS budgetSum FROM projects'
    );
    const totalBudgetYi = (Number(budgetSum) / 10000).toFixed(2);
    if (total === 0) {
      return res.json({
        total: 0, totalBudgetYi, byCategory: [], byStage: [], byOwnerCategory: [],
        byOwnerStage: [], byMonth: [], byDemandDept: [], demandYears: [prevYear, currYear],
      });
    }

    const [catRows] = await pool.query(
      "SELECT COALESCE(NULLIF(category, ''), '未分类') AS cat, COUNT(*) AS n, COALESCE(SUM(budget_wan), 0) AS budget FROM projects GROUP BY cat"
    );
    const byCategory = catRows
      .map((r) => ({ category: r.cat, count: r.n, budget: String(r.budget) }))
      .sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a.category);
        const ib = CATEGORY_ORDER.indexOf(b.category);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

    const [stageRows] = await pool.query(
      "SELECT COALESCE(NULLIF(stage, ''), '未填写') AS stg, COUNT(*) AS n FROM projects GROUP BY stg ORDER BY n DESC, stg = '未填写', stg"
    );
    const byStage = stageRows.map((r) => ({ stage: r.stg, count: r.n }));

    const [ocRows] = await pool.query(
      `SELECT COALESCE(NULLIF(owner, ''), '未分配') AS own,
              COALESCE(NULLIF(category, ''), '未分类') AS cat,
              COUNT(*) AS n
       FROM projects GROUP BY own, cat`
    );
    const map = new Map();
    for (const r of ocRows) {
      if (!map.has(r.own)) {
        map.set(r.own, { owner: r.own, total: 0 });
        for (const c of CATEGORY_ORDER) map.get(r.own)[c] = 0;
      }
      const entry = map.get(r.own);
      if (CATEGORY_ORDER.includes(r.cat)) entry[r.cat] = r.n;
      else entry['未分类'] = (entry['未分类'] || 0) + r.n;
      entry.total += r.n;
    }
    const byOwnerCategory = [...map.values()].sort((a, b) => a.owner.localeCompare(b.owner, 'zh'));

    // 责任人 × 阶段矩阵（阶段列顺序与 byStage 一致：数量降序，未填写垫底）
    const stageKeys = byStage.map((s) => s.stage);
    const [osRows] = await pool.query(
      `SELECT COALESCE(NULLIF(owner, ''), '未分配') AS own,
              COALESCE(NULLIF(stage, ''), '未填写') AS stg,
              COUNT(*) AS n
       FROM projects GROUP BY own, stg`
    );
    const smap = new Map();
    for (const r of osRows) {
      if (!smap.has(r.own)) {
        const entry = { owner: r.own, total: 0 };
        for (const s of stageKeys) entry[s] = 0;
        smap.set(r.own, entry);
      }
      const entry = smap.get(r.own);
      entry[r.stg] = (entry[r.stg] || 0) + r.n;
      entry.total += r.n;
    }
    const byOwnerStage = [...smap.values()].sort((a, b) => a.owner.localeCompare(b.owner, 'zh'));

    // 按立项批复年月聚合（时间升序），柱状图/折线图用；含每月立项金额合计（万元）
    const [monthRows] = await pool.query(
      `SELECT DATE_FORMAT(approval_date, '%Y-%m') AS ym, COUNT(*) AS n,
              COALESCE(SUM(budget_wan), 0) AS budget
       FROM projects WHERE approval_date IS NOT NULL
       GROUP BY ym ORDER BY ym`
    );
    const byMonth = monthRows.map((r) => ({ month: r.ym, count: r.n, budget: String(r.budget) }));

    // 需求部门统计：近 2 年，按 / 拆分需求部门与需求室（一一对应），按项目总数降序
    const [demandRows] = await pool.query(
      `SELECT YEAR(approval_date) AS yr, demand_dept, demand_room
       FROM projects WHERE approval_date IS NOT NULL`
    );
    const dmap = new Map();
    for (const r of demandRows) {
      const yr = Number(r.yr);
      if (yr !== prevYear && yr !== currYear) continue;
      const depts = r.demand_dept
        ? String(r.demand_dept).split('/').map((s) => s.trim()).filter(Boolean)
        : ['未填写'];
      const rooms = r.demand_room
        ? String(r.demand_room).split('/').map((s) => s.trim()).filter(Boolean)
        : ['未填写'];
      for (let i = 0; i < depts.length; i++) {
        const d = depts[i];
        const room = rooms[i] || '未填写';
        if (!dmap.has(d)) {
          dmap.set(d, {
            dept: d,
            prev: 0,
            curr: 0,
            total: 0,
            prevRooms: new Map(),
            currRooms: new Map(),
          });
        }
        const entry = dmap.get(d);
        const roomMap = yr === prevYear ? entry.prevRooms : entry.currRooms;
        if (yr === prevYear) entry.prev++;
        else entry.curr++;
        entry.total++;
        roomMap.set(room, (roomMap.get(room) || 0) + 1);
      }
    }
    const sortRooms = (map) =>
      [...map.entries()]
        .map(([room, count]) => ({ room, count }))
        .sort((a, b) => b.count - a.count || a.room.localeCompare(b.room, 'zh'));
    const byDemandDept = [...dmap.values()]
      .map((d) => ({
        dept: d.dept,
        prev: d.prev,
        curr: d.curr,
        total: d.total,
        prevRooms: sortRooms(d.prevRooms),
        currRooms: sortRooms(d.currRooms),
      }))
      .sort((a, b) => b.total - a.total || a.dept.localeCompare(b.dept, 'zh'));

    res.json({
      total, totalBudgetYi, byCategory, byStage, byOwnerCategory, byOwnerStage,
      byMonth, byDemandDept, demandYears: [prevYear, currYear],
    });
  } catch (e) {
    res.status(500).json({ error: `统计失败：${e.message}` });
  }
});

export default router;
