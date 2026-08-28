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
    '是否竣工验收', '需求部门', '需求室', '需求责任人',
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
    toStr(r.demand_dept),
    toStr(r.demand_room),
    toStr(r.demand_owner),
  ]);
  return [header, ...body];
}

// 附件下载：去掉空白的下周进展列（L 列）
export function buildAttachmentData(rows, reportDate) {
  const header = [
    '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
    '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
    `周进展(${reportDate})`,
    '主设备请购完成率', '是否交底', '主设备到货完成率', '是否上线交维',
    '是否竣工验收', '需求部门', '需求室', '需求责任人',
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
    // 周进展中的"本周"二字删除后再导出
    toStr(r.progress).replaceAll('本周', ''),
    toNum(r.purchase_rate),
    toStr(r.disclosure),
    toNum(r.arrival_rate),
    toStr(r.online_handover),
    toStr(r.final_acceptance),
    toStr(r.demand_dept),
    toStr(r.demand_room),
    toStr(r.demand_owner),
  ]);
  return [header, ...body];
}

// 样式常量（参考 核心网室项目每周进展20260821.xlsx）
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
const HEADER_FONT = { name: '宋体', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
const DATA_FONT = { name: '宋体', size: 10 };
const THIN = { style: 'thin' };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEADER_HEIGHT = 43.5;
const DATA_ROW_HEIGHT = 80;

// 列宽（A-Q，参考文件实测）
const COL_WIDTHS = [3.86, 9.6, 15.73, 30.07, 12.2, 10.46, 8.2, 9.33, 16.2,
  19.13, 22.33, 22.33, 12.86, 8.73, 12.86, 8.73, 12.86, 12.86, 12.86, 10.46];

// 每列数据区对齐（参考文件实测）
const COL_ALIGN = [
  { horizontal: 'center', vertical: 'middle' },                          // A 序号
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // B 专业类别
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // C 项目编码
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // D 项目名称
  { horizontal: 'left', vertical: 'middle' },                            // E 立项批复日期
  { horizontal: 'left', vertical: 'middle' },                            // F 分类
  { horizontal: 'left', vertical: 'middle' },                            // G 工程责任人
  { horizontal: 'center', vertical: 'middle' },                          // H 立项金额
  { horizontal: 'left', vertical: 'middle' },                            // I 项目阶段
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // J 建设内容
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // K 周进展(本周)
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // L 周进展(下周)
  { horizontal: 'center', vertical: 'middle' },                          // M 请购完成率
  { horizontal: 'center', vertical: 'middle' },                          // N 是否交底
  { horizontal: 'center', vertical: 'middle' },                          // O 到货完成率
  { horizontal: 'center', vertical: 'middle' },                          // P 是否上线交维
  { horizontal: 'center', vertical: 'middle' },                          // Q 是否竣工验收
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // R 需求部门
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // S 需求室
  { horizontal: 'left', vertical: 'middle', wrapText: true },            // T 需求责任人
];

// 表头居中，但 D/E 列参考文件为左对齐
const HEADER_ALIGN = COL_ALIGN.map((a, i) =>
  i === 3 || i === 4
    ? { horizontal: 'left', vertical: 'middle', wrapText: true }
    : { horizontal: 'center', vertical: 'middle', wrapText: true }
);

const PERCENT_COLS = [13, 15]; // M、O 列（1 基）

// 附件版本常量：删除 L 列（下周进展）后，百分比列变为 L、N
const ATTACHMENT_COL_WIDTHS = COL_WIDTHS.filter((_, i) => i !== 11);
const ATTACHMENT_COL_ALIGN = COL_ALIGN.filter((_, i) => i !== 11);
const ATTACHMENT_HEADER_ALIGN = ATTACHMENT_COL_ALIGN.map((a, i) =>
  i === 3 || i === 4
    ? { horizontal: 'left', vertical: 'middle', wrapText: true }
    : { horizontal: 'center', vertical: 'middle', wrapText: true }
);
const ATTACHMENT_PERCENT_COLS = [12, 14]; // L、N 列（1 基）

export function buildWorkbook(rows, reportDate) {
  const aoa = buildExportData(rows, reportDate);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`周报${reportDate}`);

  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  aoa.forEach((rowData, rIdx) => {
    const row = ws.addRow(rowData);
    const isHeader = rIdx === 0;
    // 表头固定行高；数据行统一高度 80
    row.height = isHeader ? HEADER_HEIGHT : DATA_ROW_HEIGHT;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = BORDER;
      cell.font = isHeader ? HEADER_FONT : DATA_FONT;
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
  const dateStr = String(nextFriday(reportDate)).replace(/-/g, '');
  a.href = url;
  a.download = `核心网室项目每周进展${dateStr}（云文档）.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildAttachmentWorkbook(rows, reportDate) {
  const aoa = buildAttachmentData(rows, reportDate);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`周报${reportDate}`);

  ws.columns = ATTACHMENT_COL_WIDTHS.map((w) => ({ width: w }));

  aoa.forEach((rowData, rIdx) => {
    const row = ws.addRow(rowData);
    const isHeader = rIdx === 0;
    row.height = isHeader ? HEADER_HEIGHT : DATA_ROW_HEIGHT;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = BORDER;
      cell.font = isHeader ? HEADER_FONT : DATA_FONT;
      cell.alignment = isHeader ? ATTACHMENT_HEADER_ALIGN[colNumber - 1] : ATTACHMENT_COL_ALIGN[colNumber - 1];
      if (isHeader) {
        cell.fill = HEADER_FILL;
      } else if (ATTACHMENT_PERCENT_COLS.includes(colNumber)) {
        cell.numFmt = '0%';
      }
    });
  });

  return wb;
}

export async function exportAttachment(rows, reportDate) {
  const wb = buildAttachmentWorkbook(rows, reportDate);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = String(reportDate).replace(/-/g, '');
  a.href = url;
  a.download = `核心网室项目每周进展${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
