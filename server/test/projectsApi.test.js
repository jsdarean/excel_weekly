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

describe('项目置顶 API', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('置顶：pin_order 从 1 递增；重复置顶 409；项目不存在 404', async () => {
    const r1 = await request(createApp()).put('/api/projects/P001/pin');
    expect(r1.status).toBe(200);
    const r2 = await request(createApp()).put('/api/projects/P002/pin');
    expect(r2.status).toBe(200);
    const [rows] = await getPool().query(
      "SELECT project_code, pin_order FROM projects ORDER BY pin_order"
    );
    expect(rows[0]).toMatchObject({ project_code: 'P001', pin_order: 1 });
    expect(rows[1]).toMatchObject({ project_code: 'P002', pin_order: 2 });

    const dup = await request(createApp()).put('/api/projects/P001/pin');
    expect(dup.status).toBe(409);
    const missing = await request(createApp()).put('/api/projects/NOPE/pin');
    expect(missing.status).toBe(404);
  });

  it('取消置顶：pin_order 置空；未置顶或不存在返回 404', async () => {
    await request(createApp()).put('/api/projects/P001/pin');
    const res = await request(createApp()).delete('/api/projects/P001/pin');
    expect(res.status).toBe(204);
    const [rows] = await getPool().query(
      "SELECT pin_order FROM projects WHERE project_code = 'P001'"
    );
    expect(rows[0].pin_order).toBeNull();

    const again = await request(createApp()).delete('/api/projects/P001/pin');
    expect(again.status).toBe(404);
    const missing = await request(createApp()).delete('/api/projects/NOPE/pin');
    expect(missing.status).toBe(404);
  });

  it('move：与相邻置顶项目交换顺序；到边界不变；未置顶/非法 direction 返回 400', async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO projects (project_code, project_name, category) VALUES ('P003', '项目丙', '收入相关')`
    );
    await request(createApp()).put('/api/projects/P001/pin');
    await request(createApp()).put('/api/projects/P002/pin');
    await request(createApp()).put('/api/projects/P003/pin');
    // 当前：P001=1, P002=2, P003=3

    // P003 上移 → P001=1, P003=2, P002=3
    const up = await request(createApp())
      .put('/api/projects/P003/pin/move')
      .send({ direction: 'up' });
    expect(up.status).toBe(200);
    let [rows] = await pool.query(
      'SELECT project_code, pin_order FROM projects WHERE pin_order IS NOT NULL ORDER BY pin_order'
    );
    expect(rows.map((r) => r.project_code)).toEqual(['P001', 'P003', 'P002']);

    // P001 下移 → P003=1... 实际交换 P001(1) 与 P003(2)
    const down = await request(createApp())
      .put('/api/projects/P001/pin/move')
      .send({ direction: 'down' });
    expect(down.status).toBe(200);
    [rows] = await pool.query(
      'SELECT project_code, pin_order FROM projects WHERE pin_order IS NOT NULL ORDER BY pin_order'
    );
    expect(rows.map((r) => r.project_code)).toEqual(['P003', 'P001', 'P002']);

    // 顶部再上移：不变
    const top = await request(createApp())
      .put('/api/projects/P003/pin/move')
      .send({ direction: 'up' });
    expect(top.status).toBe(200);
    [rows] = await pool.query(
      'SELECT project_code, pin_order FROM projects WHERE pin_order IS NOT NULL ORDER BY pin_order'
    );
    expect(rows.map((r) => r.project_code)).toEqual(['P003', 'P001', 'P002']);

    // 未置顶项目 move → 400
    await request(createApp()).delete('/api/projects/P002/pin');
    const unpinned = await request(createApp())
      .put('/api/projects/P002/pin/move')
      .send({ direction: 'up' });
    expect(unpinned.status).toBe(400);
    // 非法 direction → 400
    const badDir = await request(createApp())
      .put('/api/projects/P001/pin/move')
      .send({ direction: 'left' });
    expect(badDir.status).toBe(400);
    // 项目不存在 → 404
    const missing = await request(createApp())
      .put('/api/projects/NOPE/pin/move')
      .send({ direction: 'up' });
    expect(missing.status).toBe(404);
  });
});
