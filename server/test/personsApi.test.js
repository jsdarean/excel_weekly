import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';

describe('/api/persons', () => {
  beforeEach(resetDb);

  it('新增 → 列表 → 修改 → 删除 全流程', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/persons')
      .send({ name: '张三', phone: '13800000000', shortNumber: '61001', email: 'zs@example.com' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/api/persons');
    expect(list.body.persons).toHaveLength(1);
    expect(list.body.persons[0]).toMatchObject({
      name: '张三', phone: '13800000000',
      short_number: '61001', email: 'zs@example.com',
    });

    const updated = await request(app)
      .put(`/api/persons/${id}`)
      .send({ name: '张三', phone: '13900000000', shortNumber: '61001', email: 'zs@example.com' });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get('/api/persons');
    expect(list2.body.persons[0].phone).toBe('13900000000');

    const noop = await request(app)
      .put(`/api/persons/${id}`)
      .send({ name: '张三', phone: '13900000000', shortNumber: '61001', email: 'zs@example.com' });
    expect(noop.status).toBe(200);

    const del = await request(app).delete(`/api/persons/${id}`);
    expect(del.status).toBe(204);
    const list3 = await request(app).get('/api/persons');
    expect(list3.body.persons).toHaveLength(0);
  });

  it('name 为空返回 400；更新不存在的 id 返回 404', async () => {
    const app = createApp();
    const bad = await request(app).post('/api/persons').send({ name: '' });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .put('/api/persons/999')
      .send({ name: '李四' });
    expect(missing.status).toBe(404);
  });
});
