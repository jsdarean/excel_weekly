import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import { createApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';
import { getPool } from '../src/db.js';

function xlsxBuffer(aoa) {
  const ws = xlsx.utils.aoa_to_sheet(aoa);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function seedTemplate(name = '模板A') {
  const [r] = await getPool().query(
    'INSERT INTO report_templates (name, content) VALUES (?, ?)',
    [name, '']
  );
  return r.insertId;
}

const T1 = async () => seedTemplate();

describe('/api/vip-recipients', () => {
  beforeEach(resetDb);

  it('新增 → 列表 → 修改 → 删除 全流程（按模板隔离）', async () => {
    const app = createApp();
    const tpl1 = await seedTemplate();
    const tpl2 = await seedTemplate('模板B');

    const created = await request(app)
      .post(`/api/vip-recipients?template_id=${tpl1}`)
      .send({ dept: '网络部', title: '副总', name: '张三', email: 'zs@x.com', sendType: '抄送' });
    expect(created.status).toBe(201);
    // 模板 B 看不到模板 A 的收件人
    const listB = await request(app).get(`/api/vip-recipients?template_id=${tpl2}`);
    expect(listB.body.recipients).toHaveLength(0);
    const list = await request(app).get(`/api/vip-recipients?template_id=${tpl1}`);
    expect(list.body.recipients).toHaveLength(1);
    expect(list.body.recipients[0]).toMatchObject({
      dept: '网络部', title: '副总', name: '张三', email: 'zs@x.com', send_type: '抄送', enabled: 1,
    });

    const id = list.body.recipients[0].id;
    const updated = await request(app)
      .put(`/api/vip-recipients/${id}?template_id=${tpl1}`)
      .send({ dept: '网络部', title: '副总', name: '张三', email: 'zs@x.com', sendType: '主送' });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get(`/api/vip-recipients?template_id=${tpl1}`);
    expect(list2.body.recipients[0].send_type).toBe('主送');

    // 用错误的模板 id 更新/删除 → 404
    expect((await request(app).put(`/api/vip-recipients/${id}?template_id=${tpl2}`)
      .send({ name: '张三', email: 'zs@x.com', sendType: '主送' })).status).toBe(404);
    expect((await request(app).delete(`/api/vip-recipients/${id}?template_id=${tpl2}`)).status).toBe(404);

    const del = await request(app).delete(`/api/vip-recipients/${id}?template_id=${tpl1}`);
    expect(del.status).toBe(204);
  });

  it('校验：缺 template_id 400；姓名为空/邮箱非法/发送方式非法 400；模板不存在 404', async () => {
    const app = createApp();
    const tpl = await seedTemplate();
    expect((await request(app).post('/api/vip-recipients').send({ name: 'a', email: 'a@b.c' })).status).toBe(400);
    expect((await request(app).post(`/api/vip-recipients?template_id=${tpl}`).send({ name: '', email: 'a@b.c' })).status).toBe(400);
    expect((await request(app).post(`/api/vip-recipients?template_id=${tpl}`).send({ name: '张三', email: 'not-mail' })).status).toBe(400);
    expect((await request(app).post(`/api/vip-recipients?template_id=${tpl}`).send({ name: '张三', email: 'a@b.c', sendType: '转发' })).status).toBe(400);
    expect((await request(app).post('/api/vip-recipients?template_id=999').send({ name: '张三', email: 'a@b.c' })).status).toBe(404);
  });

  it('调整顺序：同组内按提交顺序排列，且不越模板', async () => {
    const app = createApp();
    const tpl = await seedTemplate();
    const ids = [];
    for (const name of ['甲', '乙', '丙']) {
      const r = await request(app)
        .post(`/api/vip-recipients?template_id=${tpl}`)
        .send({ name, email: `${name}@x.com`, sendType: '主送' });
      ids.push(r.body.id);
    }
    const ord = await request(app)
      .put(`/api/vip-recipients/order?template_id=${tpl}`)
      .send({ ids: [ids[2], ids[1], ids[0]] });
    expect(ord.status).toBe(200);
    const list = await request(app).get(`/api/vip-recipients?template_id=${tpl}`);
    expect(list.body.recipients.map((r) => r.name)).toEqual(['丙', '乙', '甲']);
    expect((await request(app).put(`/api/vip-recipients/order?template_id=${tpl}`).send({})).status).toBe(400);
  });

  it('Excel 导入导出（按模板）：新增/重复跳过/非法行报错', async () => {
    const app = createApp();
    const tpl = await seedTemplate();
    await getPool().query(
      'INSERT INTO vip_recipients (template_id, name, email, send_type) VALUES (?, ?, ?, ?)',
      [tpl, '张三', 'zs@x.com', '主送']
    );
    const buf = xlsxBuffer([
      ['部门', '职务', '姓名', '邮箱', '发送方式', '是否发送'],
      ['网络部', '副总', '张三', 'zs@x.com', '抄送', '是'],   // 重复 → 跳过
      ['网络部', '', '李四', 'ls@x.com', '密送', '否'],       // 新增（不发送）
      ['', '', '', '', ''],                              // 空白行忽略
      ['', '', '王五', 'bad-mail', '主送'],              // 邮箱非法 → 报错
    ]);
    const res = await request(app)
      .post(`/api/vip-recipients/import?template_id=${tpl}`)
      .attach('file', buf, 'vip.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toHaveLength(1);

    const exp = await request(app)
      .get(`/api/vip-recipients/export?template_id=${tpl}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(exp.status).toBe(200);
    const wb = xlsx.read(exp.body, { type: 'buffer' });
    const aoa = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[0]).toEqual(['部门', '职务', '姓名', '邮箱', '发送方式', '是否发送']);
    expect(aoa).toHaveLength(3);
    // 导入时 是否发送=否 → enabled=0
    const [li] = await getPool().query(
      'SELECT enabled FROM vip_recipients WHERE template_id = ? AND name = ?',
      [tpl, '李四']
    );
    expect(li[0].enabled).toBe(0);
  });
});

describe('/api/weekly-mail', () => {
  beforeEach(resetDb);

  it('配置：默认空，保存后可读回', async () => {
    const app = createApp();
    // 模板自带主题/签名字段（按模板绑定），随模板 CRUD 读写
    const tpl = await seedTemplate('带签名模板');
    const upd = await request(app)
      .put(`/api/report-templates/${tpl}`)
      .send({ name: '带签名模板', content: '', mailSubject: '省本部重点项目进展', mailSignature: '谢谢！' });
    expect(upd.status).toBe(200);
    const back = await request(app).get('/api/report-templates');
    expect(back.body.templates[0].mail_subject).toBe('省本部重点项目进展');
    expect(back.body.templates[0].mail_signature).toBe('谢谢！');
  });

  it('是否发送：取消勾选后列表 enabled=0，发送时不再取该收件人', async () => {
    const app = createApp();
    const tpl = await seedTemplate();
    const c = await request(app)
      .post(`/api/vip-recipients?template_id=${tpl}`)
      .send({ name: '张三', email: 'zs@x.com', sendType: '主送' });
    // 取消勾选（整行更新 enabled=0）
    const off = await request(app)
      .put(`/api/vip-recipients/${c.body.id}?template_id=${tpl}`)
      .send({ name: '张三', email: 'zs@x.com', sendType: '主送', enabled: false });
    expect(off.status).toBe(200);
    const list = await request(app).get(`/api/vip-recipients?template_id=${tpl}`);
    expect(list.body.recipients[0].enabled).toBe(0);
    // 该模板唯一主送被停用 → 发送校验"没有主送人员"
    const res = await request(app)
      .post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x', templateId: tpl });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('主送');
    // 重新勾选恢复
    await request(app)
      .put(`/api/vip-recipients/${c.body.id}?template_id=${tpl}`)
      .send({ name: '张三', email: 'zs@x.com', sendType: '主送', enabled: true });
    const list2 = await request(app).get(`/api/vip-recipients?template_id=${tpl}`);
    expect(list2.body.recipients[0].enabled).toBe(1);
  });

  it('发送：主题/正文为空 400；缺 templateId 400；模板无收件人 400；无邮箱配置 400', async () => {
    const app = createApp();
    const tpl = await seedTemplate();

    expect((await request(app).post('/api/weekly-mail/send').send({ html: '<p>x</p>' })).status).toBe(400);
    expect((await request(app).post('/api/weekly-mail/send').send({ subject: 's', html: '' })).status).toBe(400);
    expect((await request(app).post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>' })).status).toBe(400); // 缺 templateId

    // 模板无收件人
    const res0 = await request(app)
      .post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x', templateId: tpl });
    expect(res0.status).toBe(400);
    expect(res0.body.error).toContain('主送');

    // 有主送但无邮箱配置
    await request(app)
      .post(`/api/vip-recipients?template_id=${tpl}`)
      .send({ name: '张三', email: 'zs@x.com', sendType: '主送' });
    const res = await request(app)
      .post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x', templateId: tpl });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('邮箱配置');

    // 模板不存在 404
    expect((await request(app).post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x', templateId: 999 })).status).toBe(404);

    // 附件参数不完整 400
    expect((await request(app).post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x', templateId: tpl, attachment: { filename: 'a.xlsx' } })).status).toBe(400);
    expect((await request(app).post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x', templateId: tpl, attachment: { filename: '', contentBase64: 'AA==' } })).status).toBe(400);
  });
});
