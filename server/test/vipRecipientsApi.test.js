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

describe('/api/vip-recipients', () => {
  beforeEach(resetDb);

  it('新增 → 列表 → 修改 → 删除 全流程', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/vip-recipients')
      .send({ dept: '网络部', title: '副总', name: '张三', email: 'zs@x.com', sendType: '抄送' });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/vip-recipients');
    expect(list.body.recipients).toHaveLength(1);
    expect(list.body.recipients[0]).toMatchObject({
      dept: '网络部', title: '副总', name: '张三', email: 'zs@x.com', send_type: '抄送',
    });

    const id = list.body.recipients[0].id;
    const updated = await request(app)
      .put(`/api/vip-recipients/${id}`)
      .send({ dept: '网络部', title: '副总', name: '张三', email: 'zs@x.com', sendType: '主送' });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get('/api/vip-recipients');
    expect(list2.body.recipients[0].send_type).toBe('主送');

    const del = await request(app).delete(`/api/vip-recipients/${id}`);
    expect(del.status).toBe(204);
    const list3 = await request(app).get('/api/vip-recipients');
    expect(list3.body.recipients).toHaveLength(0);
  });

  it('校验：姓名为空/邮箱非法/发送方式非法 400；更新不存在 404', async () => {
    const app = createApp();
    expect((await request(app).post('/api/vip-recipients').send({ name: '', email: 'a@b.c' })).status).toBe(400);
    expect((await request(app).post('/api/vip-recipients').send({ name: '张三', email: 'not-mail' })).status).toBe(400);
    expect((await request(app).post('/api/vip-recipients').send({ name: '张三', email: 'a@b.c', sendType: '转发' })).status).toBe(400);
    expect((await request(app).put('/api/vip-recipients/999').send({ name: '张三', email: 'a@b.c', sendType: '主送' })).status).toBe(404);
    // 发送方式缺省为主送
    const ok = await request(app).post('/api/vip-recipients').send({ name: '张三', email: 'a@b.c' });
    expect(ok.status).toBe(201);
  });

  it('列表按 主送→抄送→密送 分组排序', async () => {
    const app = createApp();
    for (const sendType of ['密送', '主送', '抄送', '主送']) {
      await request(app)
        .post('/api/vip-recipients')
        .send({ name: `人${sendType}`, email: `${sendType}@x.com`, sendType });
    }
    const list = await request(app).get('/api/vip-recipients');
    expect(list.body.recipients.map((r) => r.send_type)).toEqual(['主送', '主送', '抄送', '密送']);
  });

  it('Excel 导入：新增/重复跳过/非法行报错；导出与导入格式一致', async () => {
    const app = createApp();
    await getPool().query(
      "INSERT INTO vip_recipients (name, email, send_type) VALUES ('张三', 'zs@x.com', '主送')"
    );
    const buf = xlsxBuffer([
      ['部门', '职务', '姓名', '邮箱', '发送方式'],
      ['网络部', '副总', '张三', 'zs@x.com', '抄送'],   // 重复 → 跳过
      ['网络部', '', '李四', 'ls@x.com', '密送'],       // 新增
      ['', '', '', '', ''],                              // 空白行忽略
      ['', '', '王五', 'bad-mail', '主送'],              // 邮箱非法 → 报错
    ]);
    const res = await request(app)
      .post('/api/vip-recipients/import')
      .attach('file', buf, 'vip.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toHaveLength(1);

    const exp = await request(app)
      .get('/api/vip-recipients/export')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(exp.status).toBe(200);
    const wb = xlsx.read(exp.body, { type: 'buffer' });
    const aoa = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[0]).toEqual(['部门', '职务', '姓名', '邮箱', '发送方式']);
    expect(aoa).toHaveLength(3); // 表头 + 2 人
  });
});

describe('/api/weekly-mail', () => {
  beforeEach(resetDb);

  it('配置：默认空，保存后可读回', async () => {
    const app = createApp();
    const def = await request(app).get('/api/weekly-mail/config');
    expect(def.body).toEqual({ subject: '', signature: '' });

    const saved = await request(app)
      .put('/api/weekly-mail/config')
      .send({ subject: '省本部重点项目进展', signature: '谢谢！' });
    expect(saved.status).toBe(200);
    const back = await request(app).get('/api/weekly-mail/config');
    expect(back.body).toEqual({ subject: '省本部重点项目进展', signature: '谢谢！' });
  });

  it('发送：主题/正文为空 400；无收件人 400；邮箱配置不完整 400', async () => {
    const app = createApp();
    expect((await request(app).post('/api/weekly-mail/send').send({ html: '<p>x</p>' })).status).toBe(400);
    expect((await request(app).post('/api/weekly-mail/send').send({ subject: 's', html: '' })).status).toBe(400);

    // 有收件人但无邮箱配置
    await request(app)
      .post('/api/vip-recipients')
      .send({ name: '张三', email: 'zs@x.com', sendType: '主送' });
    const res = await request(app)
      .post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('邮箱配置');

    // 无收件人
    await getPool().query('DELETE FROM vip_recipients');
    const res2 = await request(app)
      .post('/api/weekly-mail/send')
      .send({ subject: 's', html: '<p>x</p>', text: 'x' });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('主送');
  });
});
