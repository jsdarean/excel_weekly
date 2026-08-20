import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

function buildBuffer() {
  const header = [
    '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
    '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
    '周进展(20260814)', '周进展（20260821）', '主设备请购完成率',
    '是否交底', '主设备到货完成率', '是否上线交维', '是否竣工验收',
  ];
  const row = [
    1, '业务网', 'P001', '项目甲', '2025-09-09', '基础能力',
    '张三', 320, '项目实施阶段', '内容甲',
    '上周', '本周', 0.85, '是', 0.8, '否', '否',
  ];
  const ws = xlsx.utils.aoa_to_sheet([header, row]);
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
});
