import { describe, it, expect } from 'vitest';
import { getPool, initDatabase } from '../src/db.js';

describe('initDatabase', () => {
  it('建库并创建 projects/weekly_progress/persons 三张表（幂等）', async () => {
    await initDatabase();
    await initDatabase(); // 第二次调用不报错
    const [rows] = await getPool().query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
    );
    expect(rows.map((r) => r.TABLE_NAME ?? r.table_name)).toEqual([
      'email_config',
      'persons',
      'project_contacts',
      'projects',
      'report_templates',
      'watch_progress',
      'watched_projects',
      'weekly_progress',
    ]);
  });

  it('weekly_progress 的 (project_code, report_date) 唯一键生效', async () => {
    await initDatabase();
    const pool = getPool();
    await pool.query('DELETE FROM weekly_progress');
    const sql =
      'INSERT INTO weekly_progress (project_code, report_date) VALUES (?, ?)';
    await pool.query(sql, ['P1', '2026-08-21']);
    await expect(pool.query(sql, ['P1', '2026-08-21'])).rejects.toThrow();
  });
});
