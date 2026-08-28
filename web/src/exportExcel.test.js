import { describe, it, expect } from 'vitest';
import { buildExportData, buildWorkbook, buildAttachmentData, buildAttachmentWorkbook, nextFriday } from './exportExcel.js';

describe('nextFriday', () => {
  it('返回下一周周五（当前周五 +7 天）', () => {
    expect(nextFriday('2026-08-21')).toBe('2026-08-28');
    expect(nextFriday('2026-12-25')).toBe('2027-01-01');
  });
});

describe('buildExportData', () => {
  const rows = [
    {
      project_code: 'P001', category_major: '业务网', project_name: '项目甲',
      approval_date: '2025-09-09', category: '基础能力', owner: '张三',
      budget_wan: '320.00', stage: '项目实施阶段', content: '内容甲',
      progress: '本周进展甲', purchase_rate: '0.85', disclosure: '是',
      arrival_rate: '0.80', online_handover: '否', final_acceptance: '否',
    },
    {
      project_code: 'P002', category_major: '业务网', project_name: '项目乙',
      approval_date: null, category: '收入相关', owner: '李四',
      budget_wan: null, stage: '勘察设计阶段', content: null,
      progress: null, purchase_rate: null, disclosure: null,
      arrival_rate: null, online_handover: null, final_acceptance: null,
    },
  ];

  it('表头含序号与下周进展列（下周周五日期）', () => {
    const [header] = buildExportData(rows, '2026-08-21');
    expect(header[0]).toBe('序号');
    expect(header[10]).toBe('周进展(2026-08-21)');
    expect(header[11]).toBe('周进展(2026-08-28)');
    expect(header).toHaveLength(20);
  });

  it('序号从 1 递增，下周进展列为空，金额/完成率转数字', () => {
    const data = buildExportData(rows, '2026-08-21');
    expect(data).toHaveLength(3); // 表头 + 2 行
    expect(data[1][0]).toBe(1);
    expect(data[2][0]).toBe(2);
    // 下周进展列（索引 11）为空
    expect(data[1][11]).toBe('');
    expect(data[2][11]).toBe('');
    // 数字列转换
    expect(data[1][7]).toBe(320);
    expect(data[1][12]).toBe(0.85);
    expect(data[1][14]).toBe(0.8);
    // 空值导出为空字符串
    expect(data[2][4]).toBe('');
    expect(data[2][7]).toBe('');
  });

  it('表头与数据区样式复刻参考文件，完成率列为百分比格式', () => {
    const wb = buildWorkbook(rows, '2026-08-21');
    const ws = wb.worksheets[0];

    // 表头：宋体 10 加粗白字、亮蓝底、行高 43.5
    const h = ws.getRow(1);
    expect(h.height).toBe(43.5);
    const h1 = ws.getCell('A1');
    expect(h1.font).toMatchObject({ name: '宋体', size: 10, bold: true, color: { argb: 'FFFFFFFF' } });
    expect(h1.fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FF00B0F0' } });
    expect(h1.alignment).toMatchObject({ horizontal: 'center', vertical: 'middle', wrapText: true });
    expect(h1.border.top.style).toBe('thin');

    // 列宽复刻（A=3.86，D=30.07，K/L=22.33）
    expect(ws.getColumn(1).width).toBeCloseTo(3.86);
    expect(ws.getColumn(4).width).toBeCloseTo(30.07);
    expect(ws.getColumn(11).width).toBeCloseTo(22.33);
    expect(ws.getColumn(12).width).toBeCloseTo(22.33);

    // 数据行：宋体 10、行高统一 80、细边框
    const d = ws.getRow(2);
    expect(d.height).toBe(80);
    expect(ws.getCell('B2').font).toMatchObject({ name: '宋体', size: 10 });
    expect(ws.getCell('M2').font).toMatchObject({ name: '宋体', size: 10 });
    expect(ws.getCell('B2').border.bottom.style).toBe('thin');

    // 完成率列百分比格式
    expect(ws.getCell('M2').numFmt).toBe('0%');
    expect(ws.getCell('O2').numFmt).toBe('0%');
    expect(ws.getCell('M2').value).toBe(0.85);
  });

  it('附件下载工作簿：表头行高 43.5，数据行行高统一 80', () => {
    const wb = buildAttachmentWorkbook(rows, '2026-08-21');
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).height).toBe(43.5);
    expect(ws.getRow(2).height).toBe(80);
    expect(ws.getRow(3).height).toBe(80);
  });

  it('附件下载数据：周进展列删除所有"本周"二字，其余列不受影响', () => {
    const special = [
      { project_code: 'P1', progress: '本周完成设备到货' },
      { project_code: 'P2', progress: '本周完成A，本周完成B' },
      { project_code: 'P3', progress: '设备已到货' },
      { project_code: 'P4', progress: null },
    ];
    const data = buildAttachmentData(special, '2026-08-21');
    // 周进展为数据列索引 10
    expect(data[1][10]).toBe('完成设备到货');
    expect(data[2][10]).toBe('完成A，完成B');
    expect(data[3][10]).toBe('设备已到货');
    expect(data[4][10]).toBe('');
  });
});
