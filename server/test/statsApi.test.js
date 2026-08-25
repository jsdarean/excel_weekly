import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

async function seed() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO projects (project_code, project_name, category, owner, stage, approval_date, budget_wan, demand_dept)
     VALUES ('P001', 'a', '收入相关', '张三', '项目实施阶段', '2025-09-09', 100, 'A部门'),
            ('P002', 'b', '基础能力', '张三', '勘察设计阶段', '2025-09-20', 200, 'A部门/B部门'),
            ('P003', 'c', '基础能力', '李四', '项目实施阶段', '2025-08-04', 300, 'B部门'),
            ('P004', 'd', '支撑后端', '李四', '项目实施阶段', '2026-01-15', NULL, 'A部门'),
            ('P005', 'e', '拟取消', '王五', '终验归档阶段', NULL, 50, 'C部门'),
            ('P006', 'f', NULL, NULL, NULL, NULL, NULL, NULL)`
  );
}

describe('GET /api/stats', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('返回总数、分类/阶段分布、责任人×分类矩阵', async () => {
    const res = await request(createApp()).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    // 立项总金额：100+200+300+0+50+0 = 650 万元 = 0.07 亿元
    expect(res.body.totalBudgetYi).toBe('0.07');

    // 分类按自定义顺序：收入相关/基础能力/支撑后端/拟取消，空分类排最后
    expect(res.body.byCategory).toEqual([
      { category: '收入相关', count: 1, budget: '100.00' },
      { category: '基础能力', count: 2, budget: '500.00' },
      { category: '支撑后端', count: 1, budget: '0.00' },
      { category: '拟取消', count: 1, budget: '50.00' },
      { category: '未分类', count: 1, budget: '0.00' },
    ]);

    // 阶段按数量降序
    expect(res.body.byStage).toEqual([
      { stage: '项目实施阶段', count: 3 },
      { stage: '勘察设计阶段', count: 1 },
      { stage: '终验归档阶段', count: 1 },
      { stage: '未填写', count: 1 },
    ]);

    // 责任人 × 分类矩阵（按拼音排序：李四 < 王五 < 未分配 < 张三）
    expect(res.body.byOwnerCategory).toEqual([
      { owner: '李四', '收入相关': 0, '基础能力': 1, '支撑后端': 1, '拟取消': 0, total: 2 },
      { owner: '王五', '收入相关': 0, '基础能力': 0, '支撑后端': 0, '拟取消': 1, total: 1 },
      { owner: '未分配', '收入相关': 0, '基础能力': 0, '支撑后端': 0, '拟取消': 0, '未分类': 1, total: 1 },
      { owner: '张三', '收入相关': 1, '基础能力': 1, '支撑后端': 0, '拟取消': 0, total: 2 },
    ]);

    // 责任人 × 阶段矩阵（阶段列为动态 distinct 值，按 byStage 的顺序）
    expect(res.body.byOwnerStage).toEqual([
      { owner: '李四', '项目实施阶段': 2, '勘察设计阶段': 0, '终验归档阶段': 0, '未填写': 0, total: 2 },
      { owner: '王五', '项目实施阶段': 0, '勘察设计阶段': 0, '终验归档阶段': 1, '未填写': 0, total: 1 },
      { owner: '未分配', '项目实施阶段': 0, '勘察设计阶段': 0, '终验归档阶段': 0, '未填写': 1, total: 1 },
      { owner: '张三', '项目实施阶段': 1, '勘察设计阶段': 1, '终验归档阶段': 0, '未填写': 0, total: 2 },
    ]);

    // 按立项批复年月聚合，时间升序，无日期的项目不计入；含每月立项金额合计（万元）
    expect(res.body.byMonth).toEqual([
      { month: '2025-08', count: 1, budget: '300.00' },
      { month: '2025-09', count: 2, budget: '300.00' },
      { month: '2026-01', count: 1, budget: '0.00' },
    ]);

    // 需求部门统计：按 / 拆分，按近两年（去年、今年）分列，按总数降序，rooms 按数量降序
    expect(res.body.byDemandDept).toEqual([
      { dept: 'A部门', prev: 2, curr: 1, total: 3, prevRooms: [{ room: '未填写', count: 2 }], currRooms: [{ room: '未填写', count: 1 }] },
      { dept: 'B部门', prev: 2, curr: 0, total: 2, prevRooms: [{ room: '未填写', count: 2 }], currRooms: [] },
    ]);
  });

  it('空库返回零值结构', async () => {
    await resetDb();
    const res = await request(createApp()).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      totalBudgetYi: '0.00',
      byCategory: [],
      byStage: [],
      byOwnerCategory: [],
      byOwnerStage: [],
      byMonth: [],
      byDemandDept: [],
      demandYears: [2025, 2026],
    });
  });
});
