import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';

async function seed() {
  const app = createApp();
  // 通过导入接口或直接插库准备项目数据
  const { getPool } = await import('../src/db.js');
  await getPool().query(
    `INSERT INTO projects (project_code, project_name, category, budget_wan)
     VALUES ('P001', '项目甲', '收入相关', 100),
            ('P002', '项目乙', '基础能力', 200)`
  );
  return app;
}

describe('/api/watched', () => {
  beforeEach(resetDb);

  it('关注 → 列表（含进展倒序）→ 取消关注', async () => {
    const app = await seed();
    // 关注
    const add = await request(app).post('/api/watched').send({ code: 'P001' });
    expect(add.status).toBe(201);
    // 重复关注返回 409
    const dup = await request(app).post('/api/watched').send({ code: 'P001' });
    expect(dup.status).toBe(409);
    // 进展录入
    const p1 = await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026-08-21', detail: '第一周详情' });
    expect(p1.status).toBe(201);
    await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026-08-14', detail: '上周详情' });
    // 列表
    const list = await request(app).get('/api/watched');
    expect(list.body.watched).toHaveLength(1);
    const w = list.body.watched[0];
    expect(w.project_code).toBe('P001');
    expect(w.project_name).toBe('项目甲');
    expect(w.category).toBe('收入相关');
    expect(w.progress.map((p) => p.report_date)).toEqual(['2026-08-21', '2026-08-14']);
    expect(w.progress[0].detail).toBe('第一周详情');
    // 取消关注后进展一并删除
    const del = await request(app).delete('/api/watched/P001');
    expect(del.status).toBe(204);
    const list2 = await request(app).get('/api/watched');
    expect(list2.body.watched).toHaveLength(0);
  });

  it('关注不存在的项目返回 404；未关注的项目不能录入进展', async () => {
    const app = await seed();
    const add = await request(app).post('/api/watched').send({ code: 'NOPE' });
    expect(add.status).toBe(404);
    const p = await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026-08-21', detail: 'x' });
    expect(p.status).toBe(404);
  });
});

describe('/api/watched progress 变更/删除', () => {
  beforeEach(resetDb);

  it('编辑进展内容/时间；删除进展；同周重复录入 409', async () => {
    const app = await seed();
    await request(app).post('/api/watched').send({ code: 'P001' });
    const created = await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026-08-21', detail: '原始' });
    const id = created.body.id;

    // 同周重复录入 409
    const dup = await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026-08-21', detail: '重复' });
    expect(dup.status).toBe(409);

    // 编辑
    const upd = await request(app)
      .put(`/api/watched/progress/${id}`)
      .send({ detail: '修改后', report_date: '2026-08-28' });
    expect(upd.status).toBe(200);
    const list = await request(app).get('/api/watched');
    expect(list.body.watched[0].progress[0].detail).toBe('修改后');
    expect(list.body.watched[0].progress[0].report_date).toBe('2026-08-28');

    // 删除
    const del = await request(app).delete(`/api/watched/progress/${id}`);
    expect(del.status).toBe(204);
    const list2 = await request(app).get('/api/watched');
    expect(list2.body.watched[0].progress).toHaveLength(0);
  });

  it('参数校验：日期非法/内容为空返回 400', async () => {
    const app = await seed();
    await request(app).post('/api/watched').send({ code: 'P001' });
    const badDate = await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026/08/21', detail: 'x' });
    expect(badDate.status).toBe(400);
    const emptyDetail = await request(app)
      .post('/api/watched/P001/progress')
      .send({ report_date: '2026-08-21', detail: '  ' });
    expect(emptyDetail.status).toBe(400);
  });
});
