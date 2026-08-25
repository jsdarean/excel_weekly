import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

async function seed() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO projects (project_code, category_major, project_name, approval_date, category, owner, budget_wan, stage, content)
     VALUES ('P001', '业务网', '项目甲', '2025-09-09', '基础能力', '张三', 320, '项目实施阶段', '内容甲'),
            ('P002', '业务网', '项目乙', '2025-08-04', '支撑后端', '李四', 100, '勘察设计阶段', '内容乙')`
  );
  await pool.query(
    `INSERT INTO weekly_progress (project_code, report_date, progress, purchase_rate, disclosure, arrival_rate, online_handover, final_acceptance)
     VALUES ('P001', '2026-08-21', '本周进展', 0.85, '是', 0.8, '否', '否'),
            ('P001', '2026-08-14', '上周进展', 0.5, '否', 0.4, '否', '否'),
            ('P001', '2026-08-07', '上上周进展', NULL, NULL, NULL, NULL, NULL)`
  );
}

describe('GET /api/projects/:code', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('返回项目基础信息 + 进展列表（时间降序）', async () => {
    const res = await request(createApp()).get('/api/projects/P001');
    expect(res.status).toBe(200);
    expect(res.body.project.project_name).toBe('项目甲');
    expect(res.body.project.category).toBe('基础能力');
    expect(res.body.progress.map((p) => p.report_date)).toEqual([
      '2026-08-21', '2026-08-14', '2026-08-07',
    ]);
    expect(res.body.progress[0].progress).toBe('本周进展');
    expect(res.body.progress[0].purchase_rate).toBe('0.85');
  });

  it('项目不存在返回 404', async () => {
    const res = await request(createApp()).get('/api/projects/NOPE');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

describe('PUT /api/projects/:code', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('可修改分类、项目阶段、需求部门/室/责任人', async () => {
    const res = await request(createApp())
      .put('/api/projects/P001')
      .send({
        category: '收入相关',
        stage: '工程验收阶段',
        demand_dept: '市场部/政企部',
        demand_room: '政企客户室',
        demand_owner: '王五',
      });
    expect(res.status).toBe(200);
    const [rows] = await getPool().query(
      "SELECT category, stage, demand_dept, demand_room, demand_owner FROM projects WHERE project_code = 'P001'"
    );
    expect(rows[0].category).toBe('收入相关');
    expect(rows[0].stage).toBe('工程验收阶段');
    expect(rows[0].demand_dept).toBe('市场部/政企部');
    expect(rows[0].demand_room).toBe('政企客户室');
    expect(rows[0].demand_owner).toBe('王五');
  });

  it('非法分类/阶段返回 400', async () => {
    const bad1 = await request(createApp())
      .put('/api/projects/P001')
      .send({ category: '不存在的分类' });
    expect(bad1.status).toBe(400);
    const bad2 = await request(createApp())
      .put('/api/projects/P001')
      .send({ stage: '不存在的阶段' });
    expect(bad2.status).toBe(400);
    // 校验失败不应写入
    const [rows] = await getPool().query(
      "SELECT category FROM projects WHERE project_code = 'P001'"
    );
    expect(rows[0].category).toBe('基础能力');
  });

  it('忽略其他字段；项目不存在返回 404', async () => {
    const res = await request(createApp())
      .put('/api/projects/P001')
      .send({ category: '拟取消', project_name: '篡改名称', owner: '篡改人' });
    expect(res.status).toBe(200);
    const [rows] = await getPool().query(
      "SELECT project_name, owner, category FROM projects WHERE project_code = 'P001'"
    );
    expect(rows[0].project_name).toBe('项目甲');
    expect(rows[0].owner).toBe('张三');
    expect(rows[0].category).toBe('拟取消');

    const missing = await request(createApp())
      .put('/api/projects/NOPE')
      .send({ category: '拟取消' });
    expect(missing.status).toBe(404);
  });
});
