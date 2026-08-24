import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';
import { renderTemplate } from '../src/reportService.js';

describe('renderTemplate', () => {
  const data = {
    total: 233,
    cancelled: 3,
    categories: {
      '收入相关': { count: 24, pct: 10.3, budgetYi: '7.24', highlights: '1、项目甲，进展一。\n2、项目乙，进展二。' },
      '基础能力': { count: 87, pct: 37.3, budgetYi: '13.08', highlights: '（无）' },
      '支撑后端': { count: 119, pct: 51.1, budgetYi: '13.95', highlights: '（无）' },
    },
  };

  it('替换全部占位符', () => {
    const out = renderTemplate(
      '总数{{项目总数}}，取消{{拟取消数}}。收入相关（{{收入相关_项目数}}个，占{{收入相关_占比}}%，约{{收入相关_金额亿}}亿元）\n{{收入相关_重点进展}}',
      data
    );
    expect(out).toBe(
      '总数233，取消3。收入相关（24个，占10.3%，约7.24亿元）\n1、项目甲，进展一。\n2、项目乙，进展二。'
    );
  });

  it('未出现的分类占位符替换为空字符串，模板含重复占位符全部替换', () => {
    const out = renderTemplate('{{项目总数}}/{{项目总数}}/{{未知占位}}', data);
    expect(out).toBe('233/233/{{未知占位}}');
  });
});

describe('/api/report-templates 与 /api/report-preview', () => {
  beforeEach(async () => {
    await resetDb();
    const pool = getPool();
    await pool.query(
      `INSERT INTO projects (project_code, project_name, category, budget_wan)
       VALUES ('P001', '项目甲', '收入相关', 72400),
              ('P002', '项目乙', '基础能力', 100),
              ('P003', '项目丙', '拟取消', 50)`
    );
    await pool.query("INSERT INTO watched_projects (project_code) VALUES ('P001')");
    await pool.query(
      `INSERT INTO watch_progress (project_code, report_date, detail)
       VALUES ('P001', '2026-08-21', '本周详情。'), ('P001', '2026-08-14', '上周详情')`
    );
  });

  it('新建/列表/改名改内容/删除模板', async () => {
    const app = createApp();
    // 新建
    const c1 = await request(app)
      .post('/api/report-templates')
      .send({ name: '周报模板A', content: '共{{项目总数}}个' });
    expect(c1.status).toBe(201);
    expect(c1.body.id).toBeTruthy();
    // 列表
    const list = await request(app).get('/api/report-templates');
    expect(list.body.templates).toHaveLength(1);
    expect(list.body.templates[0].name).toBe('周报模板A');
    // 改名 + 改内容
    const upd = await request(app)
      .put(`/api/report-templates/${c1.body.id}`)
      .send({ name: '周报模板B', content: '取消{{拟取消数}}个' });
    expect(upd.status).toBe(200);
    const list2 = await request(app).get('/api/report-templates');
    expect(list2.body.templates[0].name).toBe('周报模板B');
    expect(list2.body.templates[0].content).toBe('取消{{拟取消数}}个');
    // 删除
    const del = await request(app).delete(`/api/report-templates/${c1.body.id}`);
    expect(del.status).toBe(204);
    const list3 = await request(app).get('/api/report-templates');
    expect(list3.body.templates).toHaveLength(0);
  });

  it('最多 5 个模板，第 6 个返回 400；名称为空返回 400', async () => {
    const app = createApp();
    for (let i = 1; i <= 5; i++) {
      const r = await request(app)
        .post('/api/report-templates')
        .send({ name: `模板${i}`, content: '' });
      expect(r.status).toBe(201);
    }
    const sixth = await request(app)
      .post('/api/report-templates')
      .send({ name: '模板6', content: '' });
    expect(sixth.status).toBe(400);
    expect(sixth.body.error).toContain('5');
    const noName = await request(app)
      .post('/api/report-templates')
      .send({ name: '', content: '' });
    expect(noName.status).toBe(400);
  });

  it('按 template_id 生成预览（数字与重点进展正确）', async () => {
    const app = createApp();
    const tpl = '共{{项目总数}}个项目，取消{{拟取消数}}个。收入相关（{{收入相关_项目数}}个，占{{收入相关_占比}}%，约{{收入相关_金额亿}}亿元）\n{{收入相关_重点进展}}';
    const c = await request(app)
      .post('/api/report-templates')
      .send({ name: 'A', content: tpl });
    await request(app)
      .post('/api/report-templates')
      .send({ name: 'B', content: '另一个模板{{项目总数}}' });

    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.status).toBe(200);
    // 72400 万元 = 7.24 亿元
    expect(prev.body.text).toBe(
      '共3个项目，取消1个。收入相关（1个，占33.3%，约7.24亿元）\n1、项目甲，详情。'
    );
    // 不带 id 用第一个模板
    const prev2 = await request(app).get('/api/report-preview');
    expect(prev2.body.text).toBe(
      '共3个项目，取消1个。收入相关（1个，占33.3%，约7.24亿元）\n1、项目甲，详情。'
    );
  });

  it('无模板时预览返回空文本；template_id 不存在返回 404', async () => {
    const app = createApp();
    const res = await request(app).get('/api/report-preview');
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('');
    const missing = await request(app).get('/api/report-preview?template_id=999');
    expect(missing.status).toBe(404);
  });
});
