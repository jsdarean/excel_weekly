import { getPool } from '../src/db.js';
import xlsx from 'xlsx';

const CATS = ['收入相关', '支撑后端', '基础能力'];

async function main() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT category, demand_dept, demand_room
     FROM projects
     WHERE category IN (?) AND demand_dept IS NOT NULL AND TRIM(demand_dept) <> ''`,
    [CATS]
  );

  const counts = new Map();
  for (const r of rows) {
    const depts = String(r.demand_dept)
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const rooms = String(r.demand_room || '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = 0; i < depts.length; i++) {
      const dept = depts[i];
      const room = rooms[i] || '';
      const key = `${dept}/${room}`;
      if (!counts.has(key)) {
        counts.set(key, {
          deptRoom: key,
          收入相关: 0,
          支撑后端: 0,
          基础能力: 0,
        });
      }
      const entry = counts.get(key);
      if (CATS.includes(r.category)) entry[r.category]++;
    }
  }

  const data = [...counts.values()].sort((a, b) => {
    const aSum = a['收入相关'] + a['支撑后端'] + a['基础能力'];
    const bSum = b['收入相关'] + b['支撑后端'] + b['基础能力'];
    return bSum - aSum || a.deptRoom.localeCompare(b.deptRoom, 'zh');
  });

  const aoa = [
    ['需求部门/需求室', '收入相关', '支撑后端', '基础能力'],
    ...data.map((d) => [d.deptRoom, d['收入相关'], d['支撑后端'], d['基础能力']]),
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(aoa);
  xlsx.utils.book_append_sheet(wb, ws, '统计');

  const outPath = '需求部门需求室项目统计.xlsx';
  xlsx.writeFile(wb, outPath);
  console.log(`已生成 ${outPath}，共 ${data.length} 条记录`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
