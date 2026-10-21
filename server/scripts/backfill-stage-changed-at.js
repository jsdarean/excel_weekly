// 一次性回填：根据历史周报附件（含"项目阶段"列）推断每个项目首次变为"终验归档"的周，
// 将该周日期回写到 projects.stage_changed_at（仅补空值，不覆盖已有；仅处理当前阶段仍为终验归档的项目）
// 用法：node scripts/backfill-stage-changed-at.js <周报文件夹>
import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { getPool, initDatabase } from '../src/db.js';

function fileDate(name) {
  const m = /(\d{4})(\d{2})(\d{2})/.exec(name);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('用法：node scripts/backfill-stage-changed-at.js <周报文件夹>');
    process.exit(1);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.xlsx?$/i.test(f))
    .map((f) => ({ name: f, date: fileDate(f) }))
    .filter((f) => f.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!files.length) {
    console.error('文件夹中没有可解析的周报文件');
    process.exit(1);
  }
  console.log(`共 ${files.length} 期：${files.map((f) => f.date).join('，')}`);

  // 逐期读取 项目编码 → 项目阶段
  const stageByWeek = new Map(); // code → [{date, stage}]
  for (const f of files) {
    const wb = xlsx.read(fs.readFileSync(path.join(dir, f.name)), { type: 'buffer' });
    const aoa = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    if (!aoa.length) continue;
    const header = aoa[0].map((v) => String(v ?? '').trim());
    const codeIdx = header.findIndex((h) => h.includes('项目编码'));
    const stageIdx = header.findIndex((h) => h.includes('项目阶段'));
    if (codeIdx < 0 || stageIdx < 0) {
      console.warn(`跳过 ${f.name}（缺少 项目编码/项目阶段 列）`);
      continue;
    }
    for (const row of aoa.slice(1)) {
      const code = String(row[codeIdx] ?? '').trim();
      if (!code) continue;
      const stage = String(row[stageIdx] ?? '').trim();
      if (!stageByWeek.has(code)) stageByWeek.set(code, []);
      stageByWeek.get(code).push({ date: f.date, stage });
    }
  }

  // 每个项目：第一次出现"终验归档"的日期（在该期之前的空缺周内变化的，日期偏晚，属近似值）
  const firstArchived = new Map();
  for (const [code, weeks] of stageByWeek) {
    const hit = weeks.find((w) => w.stage.includes('终验归档'));
    if (hit) firstArchived.set(code, hit.date);
  }
  console.log(`其中曾在某期处于终验归档的项目：${firstArchived.size} 个`);

  await initDatabase();
  const pool = getPool();
  let updated = 0;
  let skipped = 0;
  for (const [code, date] of firstArchived) {
    const [r] = await pool.query(
      `UPDATE projects
       SET stage_changed_at = ?
       WHERE project_code = ? AND stage LIKE '%终验归档%' AND stage_changed_at IS NULL`,
      [`${date} 00:00:00`, code]
    );
    if (r.affectedRows > 0) updated++;
    else skipped++;
  }
  console.log(`回填完成：更新 ${updated} 个（其余 ${skipped} 个无需处理：已有时间或当前阶段已不是终验归档）`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
