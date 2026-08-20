import { describe, it, expect } from 'vitest';
import xlsx from 'xlsx';
import { parseHeaderDate, parseWeeklyReport } from '../src/excel.js';

function buildBuffer(rows) {
  const header = [
    '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
    '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
    '周进展(20260814)', '周进展（20260821）', '主设备请购完成率',
    '是否交底', '主设备到货完成率', '是否上线交维', '是否竣工验收',
  ];
  const ws = xlsx.utils.aoa_to_sheet([header, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '测试');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseHeaderDate', () => {
  it('从表头解析 8 位日期', () => {
    expect(parseHeaderDate('周进展（20260821）')).toBe('2026-08-21');
  });
  it('无日期返回 null', () => {
    expect(parseHeaderDate('周进展')).toBeNull();
    expect(parseHeaderDate(null)).toBeNull();
  });
});

describe('parseWeeklyReport', () => {
  it('B-J 映射到 projects，L-Q 映射到 progress，K 列忽略', () => {
    const buf = buildBuffer([
      [1, '业务网', 'P001', '项目甲', new Date(2025, 8, 9), '基础能力',
       '张三', 320, '项目实施阶段', '建设内容甲',
       '上周进展忽略', '本周进展甲', 0.85, '是', 0.8, '否', '否'],
    ]);
    const r = parseWeeklyReport(buf);
    expect(r.headerDate).toBe('2026-08-21');
    expect(r.skipped).toBe(0);
    expect(r.projects).toEqual([
      {
        projectCode: 'P001', categoryMajor: '业务网', projectName: '项目甲',
        approvalDate: '2025-09-09', category: '基础能力', owner: '张三',
        budgetWan: 320, stage: '项目实施阶段', content: '建设内容甲',
      },
    ]);
    expect(r.progress).toEqual([
      {
        projectCode: 'P001', progress: '本周进展甲', purchaseRate: 0.85,
        disclosure: '是', arrivalRate: 0.8, onlineHandover: '否',
        finalAcceptance: '否',
      },
    ]);
  });

  it('项目编码为空但有内容的行计入 skipped，完全空白行不计', () => {
    const buf = buildBuffer([
      [2, null, null, '无编码项目', null, null, null, null, null, null,
       null, '有进展', null, null, null, null, null],
      [3, '业务网', 'P002', '项目乙', null, null, null, null, null, null,
       null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null,
       null, null, null, null, null, null, null],
    ]);
    const r = parseWeeklyReport(buf);
    expect(r.skipped).toBe(1);
    expect(r.projects.map((p) => p.projectCode)).toEqual(['P002']);
    expect(r.progress[0].progress).toBeNull();
  });
});
