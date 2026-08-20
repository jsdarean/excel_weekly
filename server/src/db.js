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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
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
}
