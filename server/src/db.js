import mysql from 'mysql2/promise';
import 'dotenv/config';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

export const DB_NAME = process.env.DB_NAME || 'weekly_report';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...config, database: DB_NAME, dateStrings: true });
  }
  return pool;
}

export async function initDatabase() {
  const conn = await mysql.createConnection(config);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARSET utf8mb4`
  );
  await conn.end();
  const p = getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(64) NOT NULL UNIQUE,
    category_major VARCHAR(64),
    project_name VARCHAR(255),
    approval_date DATE NULL,
    category VARCHAR(64),
    owner VARCHAR(64),
    budget_wan DECIMAL(12,2) NULL,
    stage VARCHAR(64),
    content TEXT,
    demand_dept VARCHAR(128),
    demand_room VARCHAR(128),
    demand_owner VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  for (const col of ['demand_dept', 'demand_room', 'demand_owner']) {
    const [exists] = await p.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = ?`,
      [col]
    );
    if (exists.length === 0) {
      await p.query(`ALTER TABLE projects ADD COLUMN ${col} VARCHAR(128)`);
    }
  }
  await p.query(`CREATE TABLE IF NOT EXISTS weekly_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(64) NOT NULL,
    report_date DATE NOT NULL,
    progress TEXT,
    purchase_rate DECIMAL(5,2) NULL,
    disclosure VARCHAR(8),
    arrival_rate DECIMAL(5,2) NULL,
    online_handover VARCHAR(8),
    final_acceptance VARCHAR(8),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_project_week (project_code, report_date)
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    phone VARCHAR(32),
    short_number VARCHAR(16),
    email VARCHAR(128),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS watched_projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(64) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await p.query(`CREATE TABLE IF NOT EXISTS watch_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(64) NOT NULL,
    report_date DATE NOT NULL,
    detail TEXT,
    source VARCHAR(16) NOT NULL DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_watch_week (project_code, report_date)
  )`);
  // 兼容旧表：若 source 字段不存在则追加
  const [cols] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'watch_progress' AND column_name = 'source'`
  );
  if (cols.length === 0) {
    await p.query(
      `ALTER TABLE watch_progress ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'manual'`
    );
    // 初始化旧数据：与 weekly_progress 存在对应关系的行标记为 weekly 副本
    await p.query(
      `UPDATE watch_progress wp
       JOIN weekly_progress wpr
         ON wpr.project_code = wp.project_code AND wpr.report_date = wp.report_date
       SET wp.source = 'weekly'`
    );
  }
  await p.query(`CREATE TABLE IF NOT EXISTS report_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL DEFAULT '默认模板',
    content MEDIUMTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
}
