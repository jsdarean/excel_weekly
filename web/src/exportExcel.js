import ExcelJS from 'exceljs';

// 下一周周五：周报时间（周五）+7 天
export function nextFriday(reportDate) {
  const d = new Date(`${reportDate}T00:00:00`);
  d.setDate(d.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function toStr(v) {
  return v === null || v === undefined ? '' : String(v);
}

// 生成导出二维数组：序号 + 页面 15 列 + 下周进展空列
export function buildExportData(rows, reportDate) {
  const header = [
    '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
    '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
    `周进展(${reportDate})`, `周进展(${nextFriday(reportDate)})`,
    '主设备请购完成率', '是否交底', '主设备到货完成率', '是否上线交维',
    '是否竣工验收',
  ];
  const body = rows.map((r, i) => [
    i + 1,
    toStr(r.category_major),
    toStr(r.project_code),
    toStr(r.project_name),
    toStr(r.approval_date),
    toStr(r.category),
    toStr(r.owner),
    toNum(r.budget_wan),
    toStr(r.stage),
    toStr(r.content),
    toStr(r.progress),
    '',
    toNum(r.purchase_rate),
    toStr(r.disclosure),
    toNum(r.arrival_rate),
    toStr(r.online_handover),
    toStr(r.final_acceptance),
  ]);
  return [header, ...body];
}

// 样式常量（参考 核心网室项目每周进展20260821.xlsx）
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
const HEADER_FONT = { name: '宋体', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
const DATA_FONT = { name: '宋体', size: 10 };
const DATA_FONT_Q = { name: 'Arial', size: 10 }; // M-Q 列参考文件用 Arial
const THIN = { style: 'thin' };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_HEIGHT = 43.5;

// 列宽（A-Q，参考文件实测）
const COL_WIDTHS = [3.86, 9.6, 15.73, 30.07, 12.2, 10.46, 8.2, 9.33, 16.2,
  19.13, 22.33, 22.33, 12.86, 8.73, 12.86, 8.73, 12.86];

// 每列数据区对齐（参考文件实测）
const COL_ALIGN = [
  { horizontal: 'center', vertical: 'center' },                          // A 序号
  { horizontal: 'left', vertical: 'center', wrapText: true },            // B 专业类别
  { horizontal: 'left', vertical: 'center', wrapText: true },            // C 项目编码
  { horizontal: 'left', vertical: 'center', wrapText: true },            // D 项目名称
  { horizontal: 'left', vertical: 'center' },                            // E 立项批复日期
  { horizontal: 'left', vertical: 'center' },                            // F 分类
  { horizontal: 'left', vertical: 'center' },                            // G 工程责任人
  { horizontal: 'center', vertical: 'center' },                          // H 立项金额
  { horizontal: 'left', vertical: 'center' },                            // I 项目阶段
  { horizontal: 'left', vertical: 'center', wrapText: true },            // J 建设内容
  { horizontal: 'left', vertical: 'center', wrapText: true },            // K 周进展(本周)
  { horizontal: 'left', vertical: 'center', wrapText: true },            // L 周进展(下周)
  { horizontal: 'center', vertical: 'center' },                          // M 请购完成率
  { horizontal: 'center', vertical: 'center' },                          // N 是否交底
  { horizontal: 'center', vertical: 'center' },                          // O 到货完成率
  { horizontal: 'center', vertical: 'center' },                          // P 是否上线交维
  { horizontal: 'center', vertical: 'center' },                          // Q 是否竣工验收
];

// 表头居中，但 D/E 列参考文件为左对齐
const HEADER_ALIGN = COL_ALIGN.map((a, i) =>
  i === 3 || i === 4
    ? { horizontal: 'left', vertical: 'center', wrapText: true }
    : { horizontal: 'center', vertical: 'center', wrapText: true }
);

const PERCENT_COLS = [13, 15]; // M、O 列（1 基）

export function buildWorkbook(rows, reportDate) {
  const aoa = buildExportData(rows, reportDate);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`周报${reportDate}`);

  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  aoa.forEach((rowData, rIdx) => {
    const row = ws.addRow(rowData);
    const isHeader = rIdx === 0;
    // 表头固定行高；数据行不设高度，由 Excel 按换行内容自动撑高（固定行高会裁掉多行文本）
    if (isHeader) row.height = HEADER_HEIGHT;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = BORDER;
      cell.font = isHeader
        ? HEADER_FONT
        : colNumber >= 13 ? DATA_FONT_Q : DATA_FONT;
      cell.alignment = isHeader ? HEADER_ALIGN[colNumber - 1] : COL_ALIGN[colNumber - 1];
      if (isHeader) {
        cell.fill = HEADER_FILL;
      } else if (PERCENT_COLS.includes(colNumber)) {
        cell.numFmt = '0%';
      }
    });
  });

  return wb;
}

export async function exportReports(rows, reportDate) {
  const wb = buildWorkbook(rows, reportDate);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `周报导出_${reportDate}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
