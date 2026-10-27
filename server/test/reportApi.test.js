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
    building: 198,
    buildingNoCancel: 195,
    delivered1w: 2,
    delivered2w: 5,
    categories: {
      '收入相关': { count: 24, pct: 10.3, budgetYi: '7.24', highlights: '1、项目甲，进展一。\n2、项目乙，进展二。',
        highlightsWithRate: '1、项目甲（请购完成率：90%，到货完成率：85%），进展一。',
        stageCounts: { '项目实施阶段': 10, '勘察设计阶段': 14 },
        buildingCount: 20, buildingPct: 10.1, buildingNoCancelPct: 10.5, buildingBudgetYi: '6.00',
        buildingStageCounts: { '项目实施阶段': 9, '勘察设计阶段': 11 } },
      '基础能力': { count: 87, pct: 37.3, budgetYi: '13.08', highlights: '（无）', stageCounts: {} },
      '支撑后端': { count: 119, pct: 51.1, budgetYi: '13.95', highlights: '（无）', stageCounts: {} },
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

  it('在建总数/剔除拟取消/近N周交付占位符替换', () => {
    const out = renderTemplate(
      '在建{{在建项目总数}}个，剔除拟取消{{在建项目总数_剔除拟取消}}个，近1周交付{{近1周交付项目数}}个，近2周交付{{近2周交付项目数}}个',
      data
    );
    expect(out).toBe('在建198个，剔除拟取消195个，近1周交付2个，近2周交付5个');
  });
  it('在建总数/近N周交付占位符替换', () => {
    const out = renderTemplate(
      '在建{{在建项目总数}}个，近1周交付{{近1周交付项目数}}个，近2周交付{{近2周交付项目数}}个',
      data
    );
    expect(out).toBe('在建198个，近1周交付2个，近2周交付5个');
  });

  it('重点进展_请购到货率版本占位符', () => {
    const out = renderTemplate('{{收入相关_重点进展_请购到货率版本}}', data);
    expect(out).toBe('1、项目甲（请购完成率：90%，到货完成率：85%），进展一。');
  });

  it('分类在建变体占位符：项目数/占比/剔除拟取消占比/金额亿/阶段项目数（剔除终验归档）', () => {
    const out = renderTemplate(
      '在建{{收入相关_在建_项目数}}个，占{{收入相关_在建_占比}}%，剔除拟取消占{{收入相关_在建_剔除拟取消_占比}}%，约{{收入相关_在建_金额亿}}亿元；实施{{收入相关_在建_项目实施阶段_项目数}}个，归档{{收入相关_在建_终验归档阶段_项目数}}个',
      data
    );
    expect(out).toBe('在建20个，占10.1%，剔除拟取消占10.5%，约6.00亿元；实施9个，归档0个');
  });

  it('分类+阶段项目数：有数据替换为数值，无该阶段替换为 0，未知分类保留原文', () => {
    const out = renderTemplate(
      '实施{{收入相关_项目实施阶段_项目数}}个，验收{{收入相关_竣工验收阶段_项目数}}个，基础能力实施{{基础能力_项目实施阶段_项目数}}个，{{未知分类_项目实施阶段_项目数}}',
      data
    );
    expect(out).toBe('实施10个，验收0个，基础能力实施0个，{{未知分类_项目实施阶段_项目数}}');
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
      `INSERT INTO projects (project_code, project_name, category, budget_wan, stage)
       VALUES ('P001', '项目甲', '收入相关', 72400, '项目实施阶段'),
              ('P002', '项目乙', '基础能力', 100, '勘察设计阶段'),
              ('P003', '项目丙', '拟取消', 50, '项目实施阶段')`
    );
    await pool.query("INSERT INTO watched_projects (project_code) VALUES ('P001')");
    await pool.query(
      `INSERT INTO watch_progress (project_code, report_date, detail)
       VALUES ('P001', '2026-08-21', '本周详情。'), ('P001', '2026-08-14', '上周详情')`
    );
    // 周报期：重点进展的时间窗口按 weekly_progress 的日期倒推
    await pool.query(
      `INSERT INTO weekly_progress (project_code, report_date, progress)
       VALUES ('P001', '2026-08-14', 'p'), ('P001', '2026-08-21', 'p')`
    );
  });

  it('新建/列表/改名改内容/删除模板', async () => {
    const app = createApp();
    // 新建（带周期类型、附件开关与邮件标题）
    const c1 = await request(app)
      .post('/api/report-templates')
      .send({
        name: '周报模板A', content: '共{{项目总数}}个',
        withAttachment: true, mailTitle: '省本部投资进展', mailSubtitle: '第（10）期',
      });
    expect(c1.status).toBe(201);
    expect(c1.body.id).toBeTruthy();
    // 列表
    const list = await request(app).get('/api/report-templates');
    expect(list.body.templates).toHaveLength(1);
    expect(list.body.templates[0].name).toBe('周报模板A');
    expect(list.body.templates[0].with_attachment).toBe(1);
    expect(list.body.templates[0].mail_title).toBe('省本部投资进展');
    expect(list.body.templates[0].subject_with_date).toBe(1); // 默认附加系统时间
    expect(list.body.templates[0].subtitle_date_mode).toBe('none'); // 副标题日期模式默认不增加
    expect(list.body.templates[0].subject_date_mode).toBe('day'); // 主题日期模式默认当天
    expect(list.body.templates[0].highlights_weeks).toBe(1); // 重点进展窗口默认 1 个周报期
    expect(list.body.templates[0].mail_subtitle).toBe('第（10）期');
    // 改名 + 改内容 + 改周期 + 关附件 + 清空标题
    const upd = await request(app)
      .put(`/api/report-templates/${c1.body.id}`)
      .send({ name: '周报模板B', content: '取消{{拟取消数}}个', withAttachment: false, subjectWithDate: false, subtitleDateMode: 'week', subjectDateMode: 'biweek' });
    expect(upd.status).toBe(200);
    const list2 = await request(app).get('/api/report-templates');
    expect(list2.body.templates[0].name).toBe('周报模板B');
    expect(list2.body.templates[0].with_attachment).toBe(0);
    expect(list2.body.templates[0].mail_title).toBeNull();
    expect(list2.body.templates[0].mail_subtitle).toBeNull();
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

  it('预览支持 分类_阶段_项目数 占位符', async () => {
    const app = createApp();
    const c = await request(app)
      .post('/api/report-templates')
      .send({
        name: 'S',
        content:
          '收入相关实施{{收入相关_项目实施阶段_项目数}}个，收入相关验收{{收入相关_竣工验收阶段_项目数}}个，基础能力勘察{{基础能力_勘察设计阶段_项目数}}个',
      });
    expect(c.status).toBe(201);
    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.status).toBe(200);
    expect(prev.body.text).toBe('收入相关实施1个，收入相关验收0个，基础能力勘察1个');
  });

  it('预览支持 在建项目总数 / 近N周交付项目数 占位符（按 stage_changed_at 统计）', async () => {
    const app = createApp();
    const pool = getPool();
    // P004：3天前交付；P005：10天前交付；P006：终验归档但无变更时间（存量数据，不计入）
    // 生产库阶段值为「终验归档阶段」，统一按 LIKE 匹配
    await pool.query(
      `INSERT INTO projects (project_code, project_name, category, stage, stage_changed_at)
       VALUES ('P004', '项目丁', '收入相关', '终验归档阶段', DATE_SUB(NOW(), INTERVAL 3 DAY)),
              ('P005', '项目戊', '基础能力', '终验归档阶段', DATE_SUB(NOW(), INTERVAL 10 DAY)),
              ('P006', '项目己', '支撑后端', '终验归档阶段', NULL)`
    );
    const c = await request(app)
      .post('/api/report-templates')
      .send({
        name: 'D',
        content: '总数{{项目总数}}，在建{{在建项目总数}}，剔除拟取消{{在建项目总数_剔除拟取消}}，近1周{{近1周交付项目数}}，近2周{{近2周交付项目数}}',
      });
    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.status).toBe(200);
    // total=6；终验归档3个 → 在建3（拟取消是分类维度，不影响在建判断）；近1周=P004；近2周=P004+P005
    expect(prev.body.text).toBe('总数6，在建3，剔除拟取消2，近1周1，近2周2');
  });

  it('双周报模板：重点进展合并最近两个周报期（去本周/去句号/分号连接）', async () => {
    const app = createApp();
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_code, project_name, category) VALUES ('P007', '项目庚', '收入相关')"
    );
    await pool.query("INSERT INTO watched_projects (project_code) VALUES ('P007')");
    await pool.query(
      `INSERT INTO watch_progress (project_code, report_date, detail, source) VALUES
        ('P007', '2026-08-14', '上周完成A。', 'weekly'),
        ('P007', '2026-08-21', '本周完成B。', 'weekly'),
        ('P007', '2026-08-28', '完成C。', 'weekly')`
    );
    const c = await request(app)
      .post('/api/report-templates')
      .send({ name: '双周', highlightsWeeks: 2, content: '{{收入相关_重点进展}}' });
    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.status).toBe(200);
    // 双周报窗口 = weekly_progress 最近 2 期（0814、0821），按时间先后合并；
    // 收入相关下还有 beforeEach 的关注项目 P001（0814 上周详情 + 0821 本周详情。→ 合并）
    expect(prev.body.text).toBe('1、项目甲，上周详情；详情。\n2、项目庚，上周完成A；完成B。');
  });

  it('周报模板：重点进展只取最近一个周报期', async () => {
    const app = createApp();
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_code, project_name, category) VALUES ('P007', '项目庚', '收入相关')"
    );
    await pool.query("INSERT INTO watched_projects (project_code) VALUES ('P007')");
    await pool.query(
      `INSERT INTO watch_progress (project_code, report_date, detail, source) VALUES
        ('P007', '2026-08-14', '上周完成A。', 'weekly'),
        ('P007', '2026-08-21', '本周完成B。', 'weekly')`
    );
    const c = await request(app)
      .post('/api/report-templates')
      .send({ name: '单周', content: '{{收入相关_重点进展}}', highlightsWeeks: 1 });
    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.body.text).toBe('1、项目甲，详情。\n2、项目庚，完成B。');
  });

  it('预览支持 分类在建变体 占位符（剔除终验归档）', async () => {
    const app = createApp();
    const pool = getPool();
    // 收入相关下加一个终验归档项目：总数变 4，收入相关 2 个，其中在建 1 个
    await pool.query(
      "INSERT INTO projects (project_code, project_name, category, stage, budget_wan) VALUES ('P008', '项目辛', '收入相关', '终验归档阶段', 10000)"
    );
    const c = await request(app)
      .post('/api/report-templates')
      .send({
        name: 'E',
        content:
          '收入相关{{收入相关_项目数}}个/在建{{收入相关_在建_项目数}}个/在建占比{{收入相关_在建_占比}}，收入相关金额{{收入相关_金额亿}}/在建金额{{收入相关_在建_金额亿}}',
      });
    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.status).toBe(200);
    // P001(72400万,实施) + P008(10000万,归档)：总额 8.24亿，在建 7.24亿
    // 全部在建（含拟取消 P003）：P001+P002+P003 = 3 → 收入相关在建占比 33.3
    expect(prev.body.text).toBe('收入相关2个/在建1个/在建占比33.3，收入相关金额8.24/在建金额7.24');
  });

  it('重点进展_请购到货率版本：项目名后附加最近一期周报的请购/到货完成率', async () => {
    const app = createApp();
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_code, project_name, category) VALUES ('P009', '项目壬', '收入相关')"
    );
    await pool.query("INSERT INTO watched_projects (project_code) VALUES ('P009')");
    await pool.query(
      `INSERT INTO watch_progress (project_code, report_date, detail, source) VALUES
        ('P009', '2026-08-14', '完成A。', 'weekly'),
        ('P009', '2026-08-21', '完成B。', 'weekly')`
    );
    // 最近一期（0821）带完成率；另有一个无完成率的项目
    await pool.query(
      `INSERT INTO weekly_progress (project_code, report_date, progress, purchase_rate, arrival_rate) VALUES
        ('P009', '2026-08-14', 'p', 0.5, 0.4),
        ('P009', '2026-08-21', 'p', 0.85, 0.8)`
    );
    const c = await request(app)
      .post('/api/report-templates')
      .send({ name: 'R', content: '{{收入相关_重点进展_请购到货率版本}}' });
    const prev = await request(app).get(`/api/report-preview?template_id=${c.body.id}`);
    expect(prev.status).toBe(200);
    // 模板默认周报 → 窗口仅最近 1 期（0821）
    // P001 无 weekly_progress 完成率 → —；P009 取最近一期（0821）的完成率
    expect(prev.body.text).toContain('1、项目甲（主设备请购率：—，主设备到货率：—），详情。');
    expect(prev.body.text).toContain('2、项目壬（主设备请购率：85%，主设备到货率：80%），完成B。');
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
