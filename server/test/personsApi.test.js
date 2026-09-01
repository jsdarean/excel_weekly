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

describe('/api/persons', () => {
  beforeEach(resetDb);

  it('新增 → 列表 → 修改 → 删除 全流程', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/persons')
      .send({ name: '张三', phone: '13800000000', shortNumber: '61001', email: 'zs@example.com', title: '室经理' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/api/persons');
    expect(list.body.persons).toHaveLength(1);
    expect(list.body.persons[0]).toMatchObject({
      name: '张三', phone: '13800000000',
      short_number: '61001', email: 'zs@example.com', title: '室经理',
    });

    const updated = await request(app)
      .put(`/api/persons/${id}`)
      .send({ name: '张三', phone: '13900000000', shortNumber: '61001', email: 'zs@example.com', title: '副总' });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get('/api/persons');
    expect(list2.body.persons[0].phone).toBe('13900000000');
    expect(list2.body.persons[0].title).toBe('副总');

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

  it('职务非法返回 400；职务可留空', async () => {
    const app = createApp();
    const bad = await request(app)
      .post('/api/persons')
      .send({ name: '张三', title: '总裁' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post('/api/persons')
      .send({ name: '张三' });
    expect(ok.status).toBe(201);
    const list = await request(app).get('/api/persons');
    expect(list.body.persons[0].title).toBeNull();
  });

  it('Excel 导入：新增/同名跳过/非法职务与空姓名报错', async () => {
    const app = createApp();
    await getPool().query("INSERT INTO persons (name, title) VALUES ('张三', '员工')");
    const buf = xlsxBuffer([
      ['姓名', '职务', '电话', '短号', '邮箱'],
      ['张三', '室经理', '139', '61001', 'zs@x.com'],   // 同名 → 跳过
      ['李四', '副总', '138', '61002', 'ls@x.com'],     // 新增
      ['王五', '总裁', '137', '', ''],                  // 非法职务 → 报错
      ['', '员工', '136', '', ''],                      // 姓名为空 → 报错
    ]);
    const res = await request(app)
      .post('/api/persons/import')
      .attach('file', buf, 'persons.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toHaveLength(2);

    const list = await request(app).get('/api/persons');
    expect(list.body.persons).toHaveLength(2);
    const li = list.body.persons.find((p) => p.name === '李四');
    expect(li).toMatchObject({ title: '副总', phone: '138', short_number: '61002', email: 'ls@x.com' });
  });

  it('Excel 导入：缺少「姓名」表头或缺文件返回 400', async () => {
    const app = createApp();
    const badBuf = xlsxBuffer([['名字', '电话'], ['张三', '139']]);
    const badHeader = await request(app)
      .post('/api/persons/import')
      .attach('file', badBuf, 'bad.xlsx');
    expect(badHeader.status).toBe(400);

    const noFile = await request(app).post('/api/persons/import');
    expect(noFile.status).toBe(400);
  });
});
