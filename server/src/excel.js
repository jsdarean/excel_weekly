import xlsx from 'xlsx';

const COL = {
  categoryMajor: 1, projectCode: 2, projectName: 3, approvalDate: 4,
  category: 5, owner: 6, budgetWan: 7, stage: 8, content: 9,
  progress: 11, purchaseRate: 12, disclosure: 13, arrivalRate: 14,
  onlineHandover: 15, finalAcceptance: 16,
};

export function parseHeaderDate(header) {
  const m = /(\d{4})(\d{2})(\d{2})/.exec(String(header ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateString(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Excel 日期序列值存在浮点误差（实测可回退约 43s），日期单元格
    // 本义为零点，按小时取整以消除跨天偏移
    const t = new Date(Math.round(v.getTime() / 3600000) * 3600000);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function parseWeeklyReport(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const header = rows[0] || [];
  const headerDate = parseHeaderDate(header[COL.progress]);

  const projects = [];
  const progress = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const hasContent = row
      .slice(1, 17)
      .some((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hasContent) continue;
    const code = toText(row[COL.projectCode]);
    if (!code) {
      skipped++;
      continue;
    }
    projects.push({
      projectCode: code,
      categoryMajor: toText(row[COL.categoryMajor]),
      projectName: toText(row[COL.projectName]),
      approvalDate: toDateString(row[COL.approvalDate]),
      category: toText(row[COL.category]),
      owner: toText(row[COL.owner]),
      budgetWan: toNumber(row[COL.budgetWan]),
      stage: toText(row[COL.stage]),
      content: toText(row[COL.content]),
    });
    progress.push({
      projectCode: code,
      progress: toText(row[COL.progress]),
      purchaseRate: toNumber(row[COL.purchaseRate]),
      disclosure: toText(row[COL.disclosure]),
      arrivalRate: toNumber(row[COL.arrivalRate]),
      onlineHandover: toText(row[COL.onlineHandover]),
      finalAcceptance: toText(row[COL.finalAcceptance]),
    });
  }

  return { projects, progress, headerDate, skipped };
}
