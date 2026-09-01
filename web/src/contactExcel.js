import ExcelJS from 'exceljs';

// 项目关联人导出：列与导入模板一致（项目名称仅展示用，导入时按项目编码匹配）
const HEADER = ['项目编码', '项目名称', '部门', '室', '职务', '姓名', '邮箱', '电话', '主送', '抄送', '密送'];
const COL_WIDTHS = [18, 32, 20, 16, 10, 12, 30, 14, 8, 8, 8];

function yn(v) {
  return v ? '是' : '';
}

export function buildContactsData(contacts) {
  const body = contacts.map((c) => [
    c.project_code ?? '',
    c.project_name ?? '',
    c.dept ?? '',
    c.room ?? '',
    c.role ?? '',
    c.name ?? '',
    c.email ?? '',
    c.phone ?? '',
    yn(c.send_to),
    yn(c.send_cc),
    yn(c.send_bcc),
  ]);
  return [HEADER, ...body];
}

export async function exportContacts(contacts) {
  const aoa = buildContactsData(contacts);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('项目关联人');
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
  a.download = `项目关联人${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
