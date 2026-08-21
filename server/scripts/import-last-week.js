// 一次性脚本：把《周报本周进展.xlsx》K 列（上周进展）作为 report_date=2026-08-14 导入 weekly_progress。
// 用法：node scripts/import-last-week.js [xlsx路径] [report_date]
import xlsx from 'xlsx';
import { getPool } from '../src/db.js';

const file = process.argv[2] || '../周报本周进展.xlsx';
const reportDate = process.argv[3] || '2026-08-14';

const COL_CODE = 2;   // C 列：项目编码
const COL_LAST = 10;  // K 列：上周进展

const wb = xlsx.readFile(file, { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

const pool = getPool();
let written = 0;
let skipped = 0;
for (const row of rows.slice(1)) {
  const code = row[COL_CODE] === null ? null : String(row[COL_CODE]).trim();
  if (!code) { skipped++; continue; }
  const progress = row[COL_LAST] === null ? null : String(row[COL_LAST]).trim();
  await pool.query(
    `INSERT INTO weekly_progress (project_code, report_date, progress)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE progress = VALUES(progress)`,
    [code, reportDate, progress || null]
  );
  written++;
}
console.log(`完成：report_date=${reportDate}，写入 ${written} 条，跳过 ${skipped} 行`);
process.exit(0);
