import { getPool, initDatabase } from '../../src/db.js';

export async function resetDb() {
  await initDatabase();
  const pool = getPool();
  await pool.query('DELETE FROM weekly_progress');
  await pool.query('DELETE FROM watch_progress');
  await pool.query('DELETE FROM watched_projects');
  await pool.query('DELETE FROM report_templates');
  await pool.query('DELETE FROM projects');
  await pool.query('DELETE FROM persons');
  await pool.query('DELETE FROM project_contacts');
  await pool.query('DELETE FROM email_config');
  await pool.query('DELETE FROM mail_logs');
  await pool.query('DELETE FROM mail_template');
}
