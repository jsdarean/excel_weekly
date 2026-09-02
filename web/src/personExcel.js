import ExcelJS from 'exceljs';

// 工程责任人导出：列与导入模板一致（姓名/职务/电话/短号/邮箱）
const HEADER = ['姓名', '职务', '电话', '短号', '邮箱'];
const COL_WIDTHS = [12, 10, 14, 10, 30];

export function buildPersonsData(persons) {
  const body = persons.map((p) => [
    p.name ?? '',
    p.title ?? '',
    p.phone ?? '',
    p.short_number ?? '',
    p.email ?? '',
  ]);
  return [HEADER, ...body];
}

export async function exportPersons(persons) {
  const aoa = buildPersonsData(persons);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('工程责任人');
  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  aoa.forEach((rowData, rIdx) => {
    const row = ws.addRow(rowData);
    const isHeader = rIdx === 0;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = border;
      cell.font = { name: '宋体', size: 10, bold: isHeader, ...(isHeader ? { color: { argb: 'FFFFFFFF' } } : {}) };
      cell.alignment = { horizontal: isHeader ? 'center' : 'left', vertical: 'middle' };
      if (isHeader) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `工程责任人${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
