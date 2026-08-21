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

  it('keyword 模糊搜索项目编码或项目名称', async () => {
    // 按编码模糊匹配
    const byCode = await request(createApp())
      .get('/api/reports')
      .query({ keyword: 'P001' });
    expect(byCode.body.rows).toHaveLength(1);
    expect(byCode.body.rows[0].project_code).toBe('P001');
    // 按名称模糊匹配
    const byName = await request(createApp())
      .get('/api/reports')
      .query({ keyword: '项目乙' });
    expect(byName.body.rows).toHaveLength(1);
    expect(byName.body.rows[0].project_code).toBe('P002');
    // 无匹配返回空
    const none = await request(createApp())
      .get('/api/reports')
      .query({ keyword: '不存在' });
    expect(none.body.rows).toHaveLength(0);
    // keyword 与 category 可组合
    const combo = await request(createApp())
      .get('/api/reports')
      .query({ keyword: '项目', category: '支撑后端' });
    expect(combo.body.rows).toHaveLength(1);
    expect(combo.body.rows[0].project_code).toBe('P002');
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

  it('排序：分类固定顺序为主（收入相关/基础能力/支撑后端/拟取消），同分类内按立项批复日期降序，无日期排在该分类最后', async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO projects (project_code, project_name, approval_date, category)
       VALUES ('S1', 'a', '2025-06-01', '支撑后端'),
              ('S2', 'b', '2025-01-01', '收入相关'),
              ('S3', 'c', '2025-09-01', '拟取消'),
              ('S4', 'd', '2025-03-01', '基础能力'),
              ('S5', 'e', '2025-08-01', '收入相关')`
    );
    const res = await request(createApp()).get('/api/reports');
    // seed 的 P001（基础能力）/P002（支撑后端）无批复日期，排在各自分类的最后
    expect(res.body.rows.map((r) => r.project_code)).toEqual([
      'S5', 'S2', 'S4', 'P001', 'S1', 'P002', 'S3',
    ]);
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
