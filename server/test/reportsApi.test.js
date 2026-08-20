import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

async function seed() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO projects (project_code, project_name, category, owner, stage)
     VALUES ('P001', '项目甲', '基础能力', '张三', '项目实施阶段'),
            ('P002', '项目乙', '支撑后端', '李四', '勘察设计阶段')`
  );
  await pool.query(
    `INSERT INTO weekly_progress (project_code, report_date, progress)
     VALUES ('P001', '2026-08-14', 'P001上周'),
            ('P001', '2026-08-21', 'P001本周'),
            ('P002', '2026-08-21', 'P002本周')`
  );
}

describe('GET /api/reports', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('缺省 report_date 取最新一周，返回合并数据', async () => {
    const res = await request(createApp()).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.reportDate).toBe('2026-08-21');
    expect(res.body.rows).toHaveLength(2);
    const p1 = res.body.rows.find((r) => r.project_code === 'P001');
    expect(p1.progress).toBe('P001本周');
    expect(p1.owner).toBe('张三');
  });

  it('可指定 report_date 查历史周', async () => {
    const res = await request(createApp())
      .get('/api/reports')
      .query({ report_date: '2026-08-14' });
    expect(res.body.reportDate).toBe('2026-08-14');
    const p1 = res.body.rows.find((r) => r.project_code === 'P001');
    expect(p1.progress).toBe('P001上周');
  });

  it('category/owner/stage 组合筛选', async () => {
    const res = await request(createApp())
      .get('/api/reports')
      .query({ category: '基础能力', owner: '张三', stage: '项目实施阶段' });
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].project_code).toBe('P001');
    const none = await request(createApp())
      .get('/api/reports')
      .query({ category: '基础能力', owner: '李四' });
    expect(none.body.rows).toHaveLength(0);
  });
});

describe('GET /api/report-dates 和 /api/filters', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('report-dates 降序返回', async () => {
    const res = await request(createApp()).get('/api/report-dates');
    expect(res.body.dates).toEqual(['2026-08-21', '2026-08-14']);
  });

  it('filters 返回 distinct 选项', async () => {
    const res = await request(createApp()).get('/api/filters');
    expect(res.body.categories).toEqual(['基础能力', '支撑后端']);
    expect(res.body.owners).toEqual(['张三', '李四']);
    expect(res.body.stages).toEqual(['勘察设计阶段', '项目实施阶段']);
  });
});
