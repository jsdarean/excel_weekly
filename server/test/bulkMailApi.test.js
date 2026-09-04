import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';
import { encryptText } from '../src/utils/crypto.js';
import { buildHtmlEmail } from '../src/bulkMailService.js';

describe('buildHtmlEmail 页头', () => {
  it('移动蓝到白色的左→右渐变；hasLogo 时含 CID 图片，否则不含', () => {
    const base = { cardRows: [], bodyText: '正文', signatureText: '签名' };
    const noLogo = buildHtmlEmail(base);
    expect(noLogo).toContain('linear-gradient(90deg,#0086d4');
    expect(noLogo).not.toContain('cid:cmcc-logo');
    const withLogo = buildHtmlEmail({ ...base, hasLogo: true });
    expect(withLogo).toContain('src="cid:cmcc-logo"');
    expect(withLogo).toContain('中国移动');
  });
});

async function seed() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO projects (project_code, project_name, content, owner, budget_wan, stage, demand_dept, demand_room, demand_owner)
     VALUES ('P001', '智算X节点工程', '建设20台推理服务器', '张三', 320, '项目实施阶段', '产品运营中心/网络部', '算力产品团队/核心网维护室', '张一/李二'),
            ('P002', '项目乙', '内容乙', '李四', NULL, NULL, NULL, NULL, NULL),
            ('P003', '项目丙', '内容丙', '王五', NULL, NULL, NULL, NULL, NULL)`
  );
  await pool.query(
    `INSERT INTO persons (name, phone, email, title)
     VALUES ('张三', '13900000000', 'zhangsan@js.chinamobile.com', '员工'),
            ('赵经理', NULL, 'zm@x.com', '室经理'),
            ('钱总', NULL, 'qz@x.com', '总经理'),
            ('王副', NULL, 'a@x.com', '副总'),
            ('无职务', NULL, 'wz@x.com', NULL),
            ('无邮经理', NULL, NULL, '室经理')`
  );
  await pool.query(
    `INSERT INTO weekly_progress (project_code, report_date, progress)
     VALUES ('P001', '2026-08-21', '完成高可用测试'),
            ('P001', '2026-08-14', '上周进展')`
  );
  // P001：主送/抄送/密送各一人，另有未勾选的一人；P002：仅主送；P003：有关联人但未勾选任何发送方式
  await pool.query(
    `INSERT INTO project_contacts (project_code, name, email, send_to, send_cc, send_bcc)
     VALUES ('P001', '收件人A', 'a@x.com', 1, 0, 0),
            ('P001', '收件人B', 'b@x.com', 0, 1, 0),
            ('P001', '收件人C', 'c@x.com', 0, 0, 1),
            ('P001', '不发送D', 'd@x.com', 0, 0, 0),
            ('P002', '收件人E', 'e@x.com', 1, 0, 0),
            ('P003', '不发送F', 'f@x.com', 0, 0, 0)`
  );
  // 通用抄送人：乙（与 P001 关联人抄送重复）、甲、丙（与 P001 主送重复）、丁（停用）
  await pool.query(
    `INSERT INTO mail_cc_list (name, email, enabled, sort_order)
     VALUES ('通用乙', 'b@x.com', 1, 1),
            ('通用甲', 'g1@x.com', 1, 2),
            ('通用丙', 'a@x.com', 1, 3),
            ('通用丁', 'off@x.com', 0, 4)`
  );
}

describe('批量邮件模板', () => {
  beforeEach(resetDb);

  it('未保存时返回默认模板；保存后返回保存的内容；主题/正文为空返回 400', async () => {
    const def = await request(createApp()).get('/api/bulk-mail/template');
    expect(def.status).toBe(200);
    expect(def.body.template.subject).toContain('{{项目名称}}');
    expect(def.body.template.body).toContain('{{周进展}}');
    expect(def.body.template.card).toContain('建设内容：{{建设内容}}');

    const tpl = { subject: '主题 {{项目编码}}', card: '名称：{{项目名称}}\n编码：{{项目编码}}', body: '正文 {{周进展}}', signature: '签名 {{工程责任人}}' };
    const saved = await request(createApp()).put('/api/bulk-mail/template').send(tpl);
    expect(saved.status).toBe(200);
    const after = await request(createApp()).get('/api/bulk-mail/template');
    expect(after.body.template).toEqual(tpl);

    const bad = await request(createApp()).put('/api/bulk-mail/template').send({ subject: '', body: 'x' });
    expect(bad.status).toBe(400);
  });
});

describe('批量邮件项目列表与预览', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('只列出有勾选收件人的项目，含收件人数和最新进展日期', async () => {
    const res = await request(createApp()).get('/api/bulk-mail/projects');
    expect(res.status).toBe(200);
    const codes = res.body.projects.map((p) => p.projectCode);
    expect(codes).toEqual(['P001', 'P002']); // P003 无人勾选，不出现
    const p1 = res.body.projects[0];
    expect(p1.toCount).toBe(1);
    // 抄送统计 = 关联人抄送1(b) + 通用抄送（甲 g1；乙与关联人重复、丙与主送重复、丁停用）+ 工程责任人1
    expect(p1.ccCount).toBe(3);
    expect(p1.bccCount).toBe(1);
    expect(p1.reportDate).toBe('2026-08-21');
    expect(p1.sentThisWeek).toBe(false);
    // P002：主送 e@x.com；抄送 = 通用乙(b) + 通用甲(g1) + 通用丙(a)（李四不在人员配置中，无邮箱）
    const p2 = res.body.projects.find((p) => p.projectCode === 'P002');
    expect(p2.toCount).toBe(1);
    expect(p2.ccCount).toBe(3);
  });

  it('最新进展周已成功发送的项目标记 sentThisWeek', async () => {
    await getPool().query(
      `INSERT INTO mail_logs (project_code, report_date, subject, status) VALUES ('P001', '2026-08-21', 's', 'success')`
    );
    const res = await request(createApp()).get('/api/bulk-mail/projects');
    const p1 = res.body.projects.find((p) => p.projectCode === 'P001');
    const p2 = res.body.projects.find((p) => p.projectCode === 'P002');
    expect(p1.sentThisWeek).toBe(true);
    expect(p2.sentThisWeek).toBe(false);
  });

  it('预览：占位符替换（含人员配置中的责任人电话/邮箱），收件人按主送/抄送/密送分组', async () => {
    const res = await request(createApp()).get('/api/bulk-mail/preview/P001');
    expect(res.status).toBe(200);
    const m = res.body.mail;
    expect(m.subject).toBe('【项目进展通报】智算X节点工程（2026-08-21）');
    expect(m.text).toContain('完成高可用测试');
    expect(m.text).toContain('建设20台推理服务器');
    expect(m.text).toContain('张三（电话：13900000000；邮箱：zhangsan@js.chinamobile.com）');
    expect(m.text).not.toContain('{{');
    expect(m.html).toContain('项目进展信息');
    expect(m.html).toContain('智算X节点工程');
    // 信息卡片：项目编码下面是建设内容，另有立项金额/项目阶段/工程责任人
    expect(m.html).toContain('建设20台推理服务器');
    expect(m.html).toContain('320');
    expect(m.html).toContain('项目实施阶段');
    expect(m.html.indexOf('项目编码')).toBeLessThan(m.html.indexOf('建设内容'));
    expect(m.html.indexOf('建设内容')).toBeLessThan(m.html.indexOf('立项金额'));
    // 需求信息表：/ 分隔的部门/科室/需求人按位置配对成行
    expect(m.html).toContain('需求部门/科室');
    expect(m.html).toContain('产品运营中心/算力产品团队');
    expect(m.html).toContain('网络部/核心网维护室');
    expect(m.html.indexOf('张一')).toBeLessThan(m.html.indexOf('李二'));
    expect(m.to).toEqual(['收件人A<a@x.com>']);
    // 抄送顺序：关联人勾选 → 通用抄送人（按配置顺序，乙与关联人重复剔除、丙与主送重复剔除、丁停用）→ 工程责任人
    expect(m.cc).toEqual([
      '收件人B<b@x.com>',
      '通用甲<g1@x.com>',
      '张三<zhangsan@js.chinamobile.com>',
    ]);
    expect(m.bcc).toEqual(['收件人C<c@x.com>']);
    expect(m.reportDate).toBe('2026-08-21');
    // 需求人张一/李二均不在主送/抄送中 → 列入缺失清单（带配对的部门/室）
    expect(m.missingDemandOwners).toEqual([
      { name: '张一', dept: '产品运营中心', room: '算力产品团队' },
      { name: '李二', dept: '网络部', room: '核心网维护室' },
    ]);
  });

  it('预览：需求人已在主送/抄送中时不列入缺失清单', async () => {
    // 把张一加成 P001 的抄送关联人
    await getPool().query(
      `INSERT INTO project_contacts (project_code, name, email, send_to, send_cc, send_bcc)
       VALUES ('P001', '张一', 'zhangyi@x.com', 0, 1, 0)`
    );
    const res = await request(createApp()).get('/api/bulk-mail/preview/P001');
    expect(res.body.mail.missingDemandOwners).toEqual([
      { name: '李二', dept: '网络部', room: '核心网维护室' },
    ]);
  });

  it('预览 P002：通用抄送人按 sort_order 排序（乙在甲前）', async () => {
    const res = await request(createApp()).get('/api/bulk-mail/preview/P002');
    expect(res.status).toBe(200);
    expect(res.body.mail.cc).toEqual([
      '通用乙<b@x.com>',
      '通用甲<g1@x.com>',
      '通用丙<a@x.com>',
    ]);
  });

  it('信息卡片可在模板中配置：自定义行与顺序生效，留空则不渲染卡片', async () => {
    const app = createApp();
    // 自定义卡片：只保留两行且换序
    await request(app).put('/api/bulk-mail/template').send({
      subject: '【项目进展通报】{{项目名称}}',
      card: '编码：{{项目编码}}\n金额：{{立项金额}}万元',
      body: '进展：{{周进展}}',
      signature: '签名',
    });
    const res = await request(app).get('/api/bulk-mail/preview/P001');
    const html = res.body.mail.html;
    expect(html).toContain('编码');
    expect(html).toContain('P001');
    expect(html).toContain('320万元');
    expect(html).not.toContain('项目阶段');
    expect(html.indexOf('编码')).toBeLessThan(html.indexOf('金额'));

    // 卡片留空 → 不渲染卡片
    await request(app).put('/api/bulk-mail/template').send({
      subject: 's', card: '', body: 'b', signature: 'g',
    });
    const res2 = await request(app).get('/api/bulk-mail/preview/P001');
    expect(res2.body.mail.html).not.toContain('项目编码');
  });

  it('预览：无进展显示「本周暂无进展」；责任人不在人员配置中则联系方式为空', async () => {
    const res = await request(createApp()).get('/api/bulk-mail/preview/P002');
    expect(res.status).toBe(200);
    const m = res.body.mail;
    expect(m.text).toContain('本周暂无进展');
    expect(m.text).toContain('李四（电话：；邮箱：）');
    expect(m.reportDate).toBeNull();
    expect(m.missingDemandOwners).toEqual([]);
  });

  it('预览不存在的项目返回 404', async () => {
    const res = await request(createApp()).get('/api/bulk-mail/preview/NOPE');
    expect(res.status).toBe(404);
  });
});

describe('批量邮件发送与记录', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('邮箱未配置返回 400；无收件人返回 400；项目不存在返回 404', async () => {
    const noCfg = await request(createApp()).post('/api/bulk-mail/send').send({ projectCode: 'P001' });
    expect(noCfg.status).toBe(400);
    expect(noCfg.body.error).toContain('邮箱配置');

    const noRcpt = await request(createApp()).post('/api/bulk-mail/send').send({ projectCode: 'P003' });
    expect(noRcpt.status).toBe(400);
    expect(noRcpt.body.error).toContain('收件人');

    const missing = await request(createApp()).post('/api/bulk-mail/send').send({ projectCode: 'NOPE' });
    expect(missing.status).toBe(404);
  });

  it('发送失败写入 mail_logs（status=failed），GET /logs 可见', async () => {
    // 配置一个不可达的 SMTP，发送必然失败
    await getPool().query(
      `INSERT INTO email_config (id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc, from_name, from_addr)
       VALUES (1, '127.0.0.1', 2525, 0, 'u@x.com', ?, '测试', 'u@x.com')`,
      [encryptText('x')]
    );
    const res = await request(createApp()).post('/api/bulk-mail/send').send({ projectCode: 'P001' });
    expect(res.status).toBe(502);

    const logs = await request(createApp()).get('/api/bulk-mail/logs');
    expect(logs.status).toBe(200);
    expect(logs.body.logs).toHaveLength(1);
    const log = logs.body.logs[0];
    expect(log.project_code).toBe('P001');
    expect(log.project_name).toBe('智算X节点工程');
    expect(log.status).toBe('failed');
    expect(log.error).toBeTruthy();
    expect(log.to_addr).toBe('收件人A<a@x.com>');
    expect(log.subject).toContain('智算X节点工程');
  });
});

describe('通用抄送人配置', () => {
  beforeEach(resetDb);

  it('整体保存：录入/修改/删除/调序一次提交，按 sort_order 返回；停用的保留但不参与抄送', async () => {
    const app = createApp();
    const empty = await request(app).get('/api/bulk-mail/cc-list');
    expect(empty.body.list).toEqual([]);

    // 保存 3 人（顺序即提交顺序）
    const saved = await request(app).put('/api/bulk-mail/cc-list').send({
      list: [
        { name: '张三', email: 'zs@x.com', enabled: true },
        { name: '李四', email: 'ls@x.com', enabled: false },
        { name: '王五', email: 'ww@x.com', enabled: true },
      ],
    });
    expect(saved.status).toBe(200);
    const got = await request(app).get('/api/bulk-mail/cc-list');
    expect(got.body.list.map((r) => [r.name, r.email, r.enabled])).toEqual([
      ['张三', 'zs@x.com', 1],
      ['李四', 'ls@x.com', 0],
      ['王五', 'ww@x.com', 1],
    ]);

    // 修改 + 删除 + 调序：删掉李四，王五提到最前，张三改邮箱
    const updated = await request(app).put('/api/bulk-mail/cc-list').send({
      list: [
        { name: '王五', email: 'ww@x.com', enabled: true },
        { name: '张三', email: 'zs2@x.com', enabled: true },
      ],
    });
    expect(updated.status).toBe(200);
    const got2 = await request(app).get('/api/bulk-mail/cc-list');
    expect(got2.body.list.map((r) => r.email)).toEqual(['ww@x.com', 'zs2@x.com']);
  });

  it('姓名/邮箱为空或邮箱格式非法返回 400；重复邮箱返回 400', async () => {
    const app = createApp();
    const noName = await request(app).put('/api/bulk-mail/cc-list').send({
      list: [{ name: '', email: 'a@x.com', enabled: true }],
    });
    expect(noName.status).toBe(400);
    const badEmail = await request(app).put('/api/bulk-mail/cc-list').send({
      list: [{ name: '张三', email: 'not-an-email', enabled: true }],
    });
    expect(badEmail.status).toBe(400);
    const dup = await request(app).put('/api/bulk-mail/cc-list').send({
      list: [
        { name: '张三', email: 'a@x.com', enabled: true },
        { name: '李四', email: 'a@x.com', enabled: true },
      ],
    });
    expect(dup.status).toBe(400);
    // 校验失败不应写入
    const got = await request(app).get('/api/bulk-mail/cc-list');
    expect(got.body.list).toEqual([]);
  });
});
