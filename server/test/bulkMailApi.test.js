import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';
import { encryptText } from '../src/utils/crypto.js';

async function seed() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO projects (project_code, project_name, content, owner, budget_wan, stage)
     VALUES ('P001', '智算X节点工程', '建设20台推理服务器', '张三', 320, '项目实施阶段'),
            ('P002', '项目乙', '内容乙', '李四', NULL, NULL),
            ('P003', '项目丙', '内容丙', '王五', NULL, NULL)`
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
}

describe('批量邮件模板', () => {
  beforeEach(resetDb);

  it('未保存时返回默认模板；保存后返回保存的内容；主题/正文为空返回 400', async () => {
    const def = await request(createApp()).get('/api/bulk-mail/template');
    expect(def.status).toBe(200);
    expect(def.body.template.subject).toContain('{{项目名称}}');
    expect(def.body.template.body).toContain('{{周进展}}');

    const tpl = { subject: '主题 {{项目编码}}', body: '正文 {{周进展}}', signature: '签名 {{工程责任人}}' };
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
    // 抄送统计含默认追加：关联人抄送1 + 总经理1 + 室经理1 + 工程责任人1（副总邮箱与主送重复被剔除）
    expect(p1.ccCount).toBe(4);
    expect(p1.bccCount).toBe(1);
    expect(p1.reportDate).toBe('2026-08-21');
    expect(p1.sentThisWeek).toBe(false);
    // P002：主送 e@x.com；默认抄送 总经理qz + 副总a + 室经理zm（李四不在人员配置中，无邮箱）
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
    expect(m.html).toContain('项目进展通报');
    expect(m.html).toContain('智算X节点工程');
    // 信息卡片：项目编码下面是建设内容，另有立项金额/项目阶段/工程责任人
    expect(m.html).toContain('建设20台推理服务器');
    expect(m.html).toContain('320');
    expect(m.html).toContain('项目实施阶段');
    expect(m.html.indexOf('项目编码')).toBeLessThan(m.html.indexOf('建设内容'));
    expect(m.html.indexOf('建设内容')).toBeLessThan(m.html.indexOf('立项金额'));
    expect(m.to).toEqual(['收件人A<a@x.com>']);
    // 抄送顺序：关联人勾选(b) → 总经理(qz) → 副总(a，已在主送中剔除) → 室经理(zm) → 工程责任人(zhangsan)
    // 无职务/无邮箱人员不加入（注意赵经理虽先插入，但总经理必须排在室经理前）
    // 收件人格式为 姓名<邮箱>
    expect(m.cc).toEqual([
      '收件人B<b@x.com>',
      '钱总<qz@x.com>',
      '赵经理<zm@x.com>',
      '张三<zhangsan@js.chinamobile.com>',
    ]);
    expect(m.bcc).toEqual(['收件人C<c@x.com>']);
    expect(m.reportDate).toBe('2026-08-21');
  });

  it('预览：无进展显示「本周暂无进展」；责任人不在人员配置中则联系方式为空', async () => {
    const res = await request(createApp()).get('/api/bulk-mail/preview/P002');
    expect(res.status).toBe(200);
    const m = res.body.mail;
    expect(m.text).toContain('本周暂无进展');
    expect(m.text).toContain('李四（电话：；邮箱：）');
    expect(m.reportDate).toBeNull();
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
