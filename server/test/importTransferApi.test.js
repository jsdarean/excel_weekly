import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

function xlsxBuffer(aoa) {
  const ws = xlsx.utils.aoa_to_sheet(aoa);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADER = ['转资申请工单号', '项目编码', '转资合计金额', '审批状态', '导入状态', '失败原因'];

function row(code, yuan, approval = '审批通过', status = '成功') {
  return ['JS-ZZSQ-1', code, yuan, approval, status, ''];
}

describe('POST /api/import-transfer', () => {
  beforeEach(resetDb);

  it('只统计 审批通过+成功；同项目多行求和；元转万元覆盖写入', async () => {
    const app = createApp();
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_code, project_name) VALUES ('P001', '甲'), ('P002', '乙'), ('P003', '丙')"
    );
    const buf = xlsxBuffer([
      HEADER,
      row('P001', 1000000),                    // 100 万
      row('P001', 500000),                     // 50 万 → P001 合计 150 万
      row('P002', 200000, '审批中'),           // 未审批通过 → 跳过
      row('P002', 300000, '审批通过', '失败'), // 导入失败 → 跳过
      row('P003', '1,000,000.50'),             // 千分位字符串
      row('P999', 999000),                     // 库中无此项目
    ]);
    const res = await request(app).post('/api/import-transfer').attach('file', buf, 'transfer.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.countedRows).toBe(4);
    expect(res.body.updated).toBe(2); // P001、P003；P002 无有效行、P999 不在库
    expect(res.body.unmatched).toBe(1);

    const [rows] = await pool.query('SELECT project_code, transferred_amount FROM projects ORDER BY project_code');
    const raw = Object.fromEntries(rows.map((r) => [r.project_code, r.transferred_amount]));
    expect(Number(raw.P001)).toBe(150);
    expect(raw.P002).toBeNull();
    expect(Number(raw.P003)).toBe(100); // DECIMAL(14,2) 保留两位（万元）
  });

  it('再次导入以新汇总覆盖旧值；缺关键列/缺文件 400', async () => {
    const app = createApp();
    const pool = getPool();
    await pool.query("INSERT INTO projects (project_code, project_name, transferred_amount) VALUES ('P001', '甲', 999)");
    const buf = xlsxBuffer([HEADER, row('P001', 200000)]);
    const res = await request(app).post('/api/import-transfer').attach('file', buf, 't.xlsx');
    expect(res.status).toBe(200);
    const [r] = await pool.query("SELECT transferred_amount FROM projects WHERE project_code='P001'");
    expect(Number(r[0].transferred_amount)).toBe(20); // 覆盖而非叠加

    expect((await request(app).post('/api/import-transfer').attach('file', xlsxBuffer([['A', 'B'], [1, 2]]), 'bad.xlsx')).status).toBe(400);
    expect((await request(app).post('/api/import-transfer')).status).toBe(400);
  });
});
