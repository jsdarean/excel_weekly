import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

async function seed() {
  await getPool().query(
    `INSERT INTO projects (project_code, project_name, content) VALUES ('P001', '项目甲', '内容甲')`
  );
}

const contact = {
  projectCode: 'P001',
  dept: '政企事业部',
  room: '行业一室',
  role: '室经理',
  name: '王五',
  email: 'wangwu@example.com',
  phone: '13800000000',
  sendTo: true,
  sendCc: false,
  sendBcc: false,
};

describe('/api/contacts', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('新增 → 列表 → 修改 → 删除 全流程', async () => {
    const app = createApp();
    const created = await request(app).post('/api/contacts').send(contact);
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/api/contacts');
    expect(list.body.contacts).toHaveLength(1);
    expect(list.body.contacts[0]).toMatchObject({
      project_code: 'P001',
      project_name: '项目甲',
      content: '内容甲',
      dept: '政企事业部',
      room: '行业一室',
      role: '室经理',
      name: '王五',
      email: 'wangwu@example.com',
      send_to: 1,
      send_cc: 0,
      send_bcc: 0,
    });

    const updated = await request(app)
      .put(`/api/contacts/${id}`)
      .send({ ...contact, phone: '13900000000', sendTo: false, sendCc: true, sendBcc: true });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get('/api/contacts?project_code=P001');
    expect(list2.body.contacts[0].phone).toBe('13900000000');
    expect(list2.body.contacts[0].send_to).toBe(0);
    expect(list2.body.contacts[0].send_cc).toBe(1);
    expect(list2.body.contacts[0].send_bcc).toBe(1);

    const del = await request(app).delete(`/api/contacts/${id}`);
    expect(del.status).toBe(204);
    const list3 = await request(app).get('/api/contacts');
    expect(list3.body.contacts).toHaveLength(0);
  });

  it('一个项目可有多名关联人', async () => {
    const app = createApp();
    await request(app).post('/api/contacts').send(contact);
    await request(app)
      .post('/api/contacts')
      .send({ ...contact, name: '赵六', role: '员工', email: 'zhaoliu@example.com' });
    const list = await request(app).get('/api/contacts?project_code=P001');
    expect(list.body.contacts).toHaveLength(2);
  });

  it('项目不存在返回 404；姓名为空返回 400；职务非法返回 400', async () => {
    const app = createApp();
    const noProj = await request(app)
      .post('/api/contacts')
      .send({ ...contact, projectCode: 'NOPE' });
    expect(noProj.status).toBe(404);
    const noName = await request(app).post('/api/contacts').send({ ...contact, name: '' });
    expect(noName.status).toBe(400);
    const badRole = await request(app)
      .post('/api/contacts')
      .send({ ...contact, role: '分管副总' });
    expect(badRole.status).toBe(400);
  });

  it('勾选发送但邮箱为空返回 400；不勾选任何发送方式时邮箱可空；更新不存在的 id 返回 404', async () => {
    const app = createApp();
    const noEmail = await request(app).post('/api/contacts').send({ ...contact, email: '' });
    expect(noEmail.status).toBe(400);
    const noEmailBcc = await request(app)
      .post('/api/contacts')
      .send({ ...contact, email: '', sendTo: false, sendBcc: true });
    expect(noEmailBcc.status).toBe(400);
    // 不勾选任何发送方式时邮箱可空
    const ok = await request(app)
      .post('/api/contacts')
      .send({ ...contact, email: '', sendTo: false });
    expect(ok.status).toBe(201);
    const missing = await request(app).put('/api/contacts/999').send(contact);
    expect(missing.status).toBe(404);
  });
});
