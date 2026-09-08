import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';

describe('/api/directory', () => {
  beforeEach(resetDb);

  it('新增 → 列表 → 修改 → 删除 全流程', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/directory')
      .send({ dept: '网络部', room: '核心网室', name: '张三', title: '员工', email: 'zs@x.com', phone: '138' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/api/directory');
    expect(list.body.directory).toHaveLength(1);
    expect(list.body.directory[0]).toMatchObject({
      dept: '网络部', room: '核心网室', name: '张三', title: '员工', email: 'zs@x.com', phone: '138',
    });

    const updated = await request(app)
      .put(`/api/directory/${id}`)
      .send({ dept: '网络部', room: '核心网室', name: '张三', title: '室经理', email: 'zs@x.com', phone: '139' });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get('/api/directory');
    expect(list2.body.directory[0]).toMatchObject({ title: '室经理', phone: '139' });

    const del = await request(app).delete(`/api/directory/${id}`);
    expect(del.status).toBe(204);
    const list3 = await request(app).get('/api/directory');
    expect(list3.body.directory).toHaveLength(0);
  });

  it('name 为空返回 400；职务非法返回 400；更新/删除不存在 id 返回 404', async () => {
    const app = createApp();
    expect((await request(app).post('/api/directory').send({ name: '' })).status).toBe(400);
    expect((await request(app).post('/api/directory').send({ name: '张三', title: '总裁' })).status).toBe(400);
    expect((await request(app).put('/api/directory/999').send({ name: '张三' })).status).toBe(404);
    expect((await request(app).delete('/api/directory/999')).status).toBe(404);

    const ok = await request(app).post('/api/directory').send({ name: '张三' });
    expect(ok.status).toBe(201);
    const list = await request(app).get('/api/directory');
    expect(list.body.directory[0].title).toBeNull();
  });

  it('部门/室/姓名筛选与级联接口', async () => {
    const app = createApp();
    const rows = [
      { dept: '网络部', room: '核心网室', name: '张三' },
      { dept: '网络部', room: '传输室', name: '李四' },
      { dept: 'IT 中心', room: '平台室', name: '张五' },
    ];
    for (const r of rows) {
      await request(app).post('/api/directory').send(r);
    }

    // 姓名模糊查
    const byQ = await request(app).get('/api/directory?q=张');
    expect(byQ.body.directory.map((r) => r.name).sort()).toEqual(['张三', '张五']);

    // 部门 + 室筛选
    const byDept = await request(app).get('/api/directory?dept=网络部');
    expect(byDept.body.directory).toHaveLength(2);
    const byRoom = await request(app).get('/api/directory?dept=网络部&room=传输室');
    expect(byRoom.body.directory.map((r) => r.name)).toEqual(['李四']);

    // 级联：部门去重
    const depts = await request(app).get('/api/directory/departments');
    expect(depts.body.departments).toEqual(['IT 中心', '网络部']);

    // 级联：某部门下的室去重
    const rooms = await request(app).get('/api/directory/rooms?dept=网络部');
    expect(rooms.body.rooms).toEqual(['传输室', '核心网室']);

    // 缺 dept 参数返回空
    const noDept = await request(app).get('/api/directory/rooms');
    expect(noDept.body.rooms).toEqual([]);
  });
});
