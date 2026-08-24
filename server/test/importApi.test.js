import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

const HEADER = [
  '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
  '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
  '周进展(20260814)', '周进展（20260821）', '主设备请购完成率',
  '是否交底', '主设备到货完成率', '是否上线交维', '是否竣工验收',
  '需求部门', '需求室', '需求责任人',
];

function buildRow({
  idx = 1,
  categoryMajor = '业务网',
  projectCode = 'P001',
  projectName = '项目甲',
  approvalDate = '2025-09-09',
  category = '基础能力',
  owner = '张三',
  budgetWan = 320,
  stage = '项目实施阶段',
  content = '内容甲',
  lastWeek = '上周',
  progress = '本周',
  purchaseRate = 0.85,
  disclosure = '是',
  arrivalRate = 0.8,
  onlineHandover = '否',
  finalAcceptance = '否',
  demandDept = null,
  demandRoom = null,
  demandOwner = null,
} = {}) {
  return [
    idx, categoryMajor, projectCode, projectName, approvalDate, category,
    owner, budgetWan, stage, content, lastWeek, progress, purchaseRate,
    disclosure, arrivalRate, onlineHandover, finalAcceptance,
    demandDept, demandRoom, demandOwner,
  ];
}

function buildBuffer(row = buildRow()) {
  const ws = xlsx.utils.aoa_to_sheet([HEADER, row]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '测试');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildBufferTwo(progress1 = '本周1', progress2 = '本周2') {
  const row1 = buildRow({
    idx: 1, projectCode: 'P001', projectName: '项目甲', category: '基础能力',
    owner: '张三', progress: progress1,
  });
  const row2 = buildRow({
    idx: 2, projectCode: 'P002', projectName: '项目乙', category: '收入相关',
    owner: '李四', budgetWan: 420, stage: '项目设计阶段', content: '内容乙',
    purchaseRate: 0.9, arrivalRate: 0.85, progress: progress2,
  });
  const ws = xlsx.utils.aoa_to_sheet([HEADER, row1, row2]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '测试');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('POST /api/import', () => {
  beforeEach(resetDb);

  it('上传结构不符的 Excel 返回 400 且提示具体缺失列', async () => {
    const header = [
      '序号', '专业类别', '其他', '项目名称', '立项批复日期', '分类',
      '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
      '周进展(20260814)', '周进展（20260821）', '主设备请购完成率',
      '是否交底', '主设备到货完成率', '是否上线交维', '是否竣工验收',
    ];
    const ws = xlsx.utils.aoa_to_sheet([header]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, '测试');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const res = await request(createApp())
      .post('/api/import')
      .attach('file', buf, 'wrong.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('项目编码');
  });

  it('不传 report_date 时用表头解析的日期导入', async () => {
    const res = await request(createApp())
      .post('/api/import')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reportDate: '2026-08-21', inserted: 1, updated: 0,
      progressWritten: 1, skipped: 0,
    });
  });

  it('导入时把需求部门/需求室/需求责任人写入基础数据表', async () => {
    const buf = buildBuffer(buildRow({
      demandDept: '市场部', demandRoom: '业务支撑室', demandOwner: '王五',
    }));
    const res = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buf, 'weekly.xlsx');
    expect(res.status).toBe(200);
    const [rows] = await getPool().query(
      'SELECT demand_dept, demand_room, demand_owner FROM projects WHERE project_code = ?',
      ['P001']
    );
    expect(rows[0]).toEqual({
      demand_dept: '市场部', demand_room: '业务支撑室', demand_owner: '王五',
    });
  });

  it('同一 report_date 重复导入返回 409，带 overwrite=true 后覆盖', async () => {
    await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    const again = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(again.status).toBe(409);
    expect(again.body.conflict).toBe(true);
    const overwrite = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .field('overwrite', 'true')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(overwrite.status).toBe(200);
    const [w] = await getPool().query('SELECT COUNT(*) AS n FROM weekly_progress');
    expect(w[0].n).toBe(1);
  });

  it('重复导入时覆盖需求部门/需求室/需求责任人', async () => {
    const buf1 = buildBuffer(buildRow({
      demandDept: '市场部', demandRoom: '业务支撑室', demandOwner: '王五',
    }));
    await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buf1, 'w1.xlsx');
    const buf2 = buildBuffer(buildRow({
      demandDept: '政企部', demandRoom: '核心网室', demandOwner: '赵六',
    }));
    await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .field('overwrite', 'true')
      .attach('file', buf2, 'w2.xlsx');
    const [rows] = await getPool().query(
      'SELECT demand_dept, demand_room, demand_owner FROM projects WHERE project_code = ?',
      ['P001']
    );
    expect(rows[0]).toEqual({
      demand_dept: '政企部', demand_room: '核心网室', demand_owner: '赵六',
    });
  });

  it('缺少文件返回 400；report_date 格式非法返回 400', async () => {
    const noFile = await request(createApp()).post('/api/import');
    expect(noFile.status).toBe(400);
    expect(noFile.body.error).toBeTruthy();
    const badDate = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026/08/21')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(badDate.status).toBe(400);
  });

  it('覆盖导入时同步更新已关注项目的 watch_progress 副本（手工修改的不覆盖）', async () => {
    const app = createApp();
    // 首次导入
    await request(app)
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buildBufferTwo('本周', '本周'), 'w1.xlsx');
    // 关注两个项目
    await request(app).post('/api/watched').send({ code: 'P001' });
    await request(app).post('/api/watched').send({ code: 'P002' });

    // 把 P001 的副本手工改成“手工改”
    let list = await request(app).get('/api/watched');
    const p1 = list.body.watched.find((w) => w.project_code === 'P001');
    await request(app)
      .put(`/api/watched/progress/${p1.progress[0].id}`)
      .send({ report_date: '2026-08-21', detail: '手工改' });

    // 覆盖导入，进度更新
    const res = await request(app)
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .field('overwrite', 'true')
      .attach('file', buildBufferTwo('本周更新1', '本周更新2'), 'w2.xlsx');
    expect(res.status).toBe(200);

    list = await request(app).get('/api/watched');
    const p1Again = list.body.watched.find((w) => w.project_code === 'P001');
    const p2Again = list.body.watched.find((w) => w.project_code === 'P002');
    // P001 手工修改过，不应被覆盖
    expect(p1Again.progress[0].detail).toBe('手工改');
    // P002 仍是 weekly 副本，应随导入更新
    expect(p2Again.progress[0].detail).toBe('本周更新2');
  });

  it('导入新周次时自动为已关注项目补一份 watch_progress 副本', async () => {
    const app = createApp();
    await request(app)
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buildBufferTwo('本周', '本周'), 'w1.xlsx');
    await request(app).post('/api/watched').send({ code: 'P001' });

    // 导入新的一周 2026-08-28
    const buf2 = buildBufferTwo('下周', '下周');
    await request(app)
      .post('/api/import')
      .field('report_date', '2026-08-28')
      .attach('file', buf2, 'w2.xlsx');

    const list = await request(app).get('/api/watched');
    const p1 = list.body.watched.find((w) => w.project_code === 'P001');
    expect(p1.progress.map((p) => p.report_date)).toContain('2026-08-28');
    const p28 = p1.progress.find((p) => p.report_date === '2026-08-28');
    expect(p28.detail).toBe('下周');
  });
});
