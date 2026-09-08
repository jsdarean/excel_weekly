// 一次性割接：把 project_contacts 中的人员导入通讯录 directory
// 去重规则：按姓名去重，同名保留信息更全的一条；role（员工/室经理）映射为通讯录职务 title
// 幂等：已存在的姓名跳过，可重复执行
import { getPool, initDatabase } from '../src/db.js';

const ROLE_TO_TITLE = { 员工: '员工', 室经理: '室经理' };

async function main() {
  await initDatabase();
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT dept, room, role, name, email, phone
     FROM project_contacts
     WHERE name IS NOT NULL AND name <> ''
     ORDER BY id`
  );

  // 按姓名去重：优先保留有邮箱/电话的记录
  const byName = new Map();
  for (const r of rows) {
    const key = r.name.trim();
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, r);
    } else {
      const score = (x) => (x.email ? 1 : 0) + (x.phone ? 1 : 0);
      if (score(r) > score(prev)) byName.set(key, r);
    }
  }

  let added = 0;
  let skipped = 0;
  for (const r of byName.values()) {
    const [dup] = await pool.query('SELECT 1 AS x FROM directory WHERE name = ?', [r.name.trim()]);
    if (dup.length) {
      skipped++;
      continue;
    }
    const title = ROLE_TO_TITLE[r.role] ?? null;
    await pool.query(
      'INSERT INTO directory (dept, room, name, title, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [r.dept || null, r.room || null, r.name.trim(), title, r.email || null, r.phone || null]
    );
    added++;
  }

  console.log(`割接完成：共 ${byName.size} 人（去重后），新增 ${added} 人，跳过已存在 ${skipped} 人`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
