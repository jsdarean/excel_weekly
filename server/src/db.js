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
    plan_cutover_date DATE NULL,
    stage_changed_at DATETIME NULL,
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
  // 兼容旧表：置顶顺序列（NULL = 不置顶，数字越小排越前）
  const [pinCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'pin_order'`
  );
  if (pinCol.length === 0) {
    await p.query('ALTER TABLE projects ADD COLUMN pin_order INT NULL');
  }
  // 兼容旧表：计划割接上线时间（来自 PMS 宽表，已有值不被覆盖）
  const [cutoverCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'plan_cutover_date'`
  );
  if (cutoverCol.length === 0) {
    await p.query('ALTER TABLE projects ADD COLUMN plan_cutover_date DATE NULL');
  }
  // 兼容旧表：阶段变更时间（阶段发生变化时由导入流程写入，用于"近N周交付项目数"统计）
  const [stageChangedCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'stage_changed_at'`
  );
  if (stageChangedCol.length === 0) {
    await p.query('ALTER TABLE projects ADD COLUMN stage_changed_at DATETIME NULL');
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
    title VARCHAR(16),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 兼容旧表：职务列（员工/室经理/副总/总经理，可空）
  const [titleCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'persons' AND column_name = 'title'`
  );
  if (titleCol.length === 0) {
    await p.query('ALTER TABLE persons ADD COLUMN title VARCHAR(16)');
  }
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
    period_type VARCHAR(8) NOT NULL DEFAULT '周报',
    with_attachment TINYINT(1) NOT NULL DEFAULT 0,
    mail_title VARCHAR(128) NULL,
    mail_subtitle VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 兼容旧表：周期类型（周报/双周报/月报，决定重点进展汇总的时间窗口）
  const [periodCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'report_templates' AND column_name = 'period_type'`
  );
  if (periodCol.length === 0) {
    await p.query("ALTER TABLE report_templates ADD COLUMN period_type VARCHAR(8) NOT NULL DEFAULT '周报'");
  }
  // 兼容旧表：发送时是否附带 Excel 附件（0/1）
  const [attachCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'report_templates' AND column_name = 'with_attachment'`
  );
  if (attachCol.length === 0) {
    await p.query('ALTER TABLE report_templates ADD COLUMN with_attachment TINYINT(1) NOT NULL DEFAULT 0');
  }
  // 兼容旧表：富文本邮件标题/副标题（留空用默认：省本部重点工程项目进展 / 周报日期）
  const [mailTitleCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'report_templates' AND column_name = 'mail_title'`
  );
  if (mailTitleCol.length === 0) {
    await p.query('ALTER TABLE report_templates ADD COLUMN mail_title VARCHAR(128) NULL');
    await p.query('ALTER TABLE report_templates ADD COLUMN mail_subtitle VARCHAR(255) NULL');
  }
  // 项目关联人（需求侧联系人）：一个项目可有多名关联人
  // send_to/send_cc/send_bcc 分别表示邮件主送/抄送/密送
  await p.query(`CREATE TABLE IF NOT EXISTS project_contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(64) NOT NULL,
    dept VARCHAR(128),
    room VARCHAR(128),
    role VARCHAR(16),
    name VARCHAR(64) NOT NULL,
    email VARCHAR(128),
    phone VARCHAR(32),
    send_to TINYINT(1) NOT NULL DEFAULT 1,
    send_cc TINYINT(1) NOT NULL DEFAULT 0,
    send_bcc TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_project (project_code)
  )`);
  // 兼容旧表：原 subscribed（订阅）列拆分为主送/抄送/密送
  const [subCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'project_contacts' AND column_name = 'subscribed'`
  );
  if (subCol.length > 0) {
    await p.query(
      `ALTER TABLE project_contacts
       ADD COLUMN send_to TINYINT(1) NOT NULL DEFAULT 1,
       ADD COLUMN send_cc TINYINT(1) NOT NULL DEFAULT 0,
       ADD COLUMN send_bcc TINYINT(1) NOT NULL DEFAULT 0`
    );
    await p.query('UPDATE project_contacts SET send_to = subscribed');
    await p.query('ALTER TABLE project_contacts DROP COLUMN subscribed');
  }
  // 通讯录：部门→室→人员，供项目关联人录入时检索带出
  await p.query(`CREATE TABLE IF NOT EXISTS directory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dept VARCHAR(128),
    room VARCHAR(128),
    name VARCHAR(64) NOT NULL,
    title VARCHAR(16),
    email VARCHAR(128),
    phone VARCHAR(32),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 邮箱配置（单行，id 固定为 1；smtp_pass_enc 为 AES-256-GCM 加密后的授权码）
  await p.query(`CREATE TABLE IF NOT EXISTS email_config (
    id INT PRIMARY KEY,
    smtp_host VARCHAR(128),
    smtp_port INT,
    smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
    smtp_user VARCHAR(128),
    smtp_pass_enc TEXT,
    from_name VARCHAR(64),
    from_addr VARCHAR(128),
    imap_enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 兼容旧表：IMAP 存档开关
  const [imapCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'email_config' AND column_name = 'imap_enabled'`
  );
  if (imapCol.length === 0) {
    await p.query('ALTER TABLE email_config ADD COLUMN imap_enabled TINYINT(1) NOT NULL DEFAULT 1');
  }
  // 批量邮件模板（单行，id 固定为 1）：主题/信息卡片/正文/签名，均支持 {{占位符}}
  await p.query(`CREATE TABLE IF NOT EXISTS mail_template (
    id INT PRIMARY KEY,
    subject VARCHAR(255),
    card MEDIUMTEXT,
    body MEDIUMTEXT,
    signature MEDIUMTEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 兼容旧表：信息卡片模板列
  const [cardCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'mail_template' AND column_name = 'card'`
  );
  if (cardCol.length === 0) {
    await p.query('ALTER TABLE mail_template ADD COLUMN card MEDIUMTEXT AFTER subject');
  }
  // 批量邮件发送记录
  await p.query(`CREATE TABLE IF NOT EXISTS mail_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_code VARCHAR(64) NOT NULL,
    report_date DATE NULL,
    subject VARCHAR(255),
    to_addr TEXT,
    cc_addr TEXT,
    bcc_addr TEXT,
    status VARCHAR(16) NOT NULL,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // 批量邮件通用抄送人（按 sort_order 排序，enabled=0 暂停全量抄送）
  await p.query(`CREATE TABLE IF NOT EXISTS mail_cc_list (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    email VARCHAR(128) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // 周报邮件 VIP 收件人（send_type：主送/抄送/密送；sort_order 控制同组内顺序；template_id 绑定模板，各模板独立名单）
  await p.query(`CREATE TABLE IF NOT EXISTS vip_recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    dept VARCHAR(128),
    title VARCHAR(16),
    name VARCHAR(64) NOT NULL,
    email VARCHAR(128) NOT NULL,
    send_type VARCHAR(8) NOT NULL DEFAULT '主送',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 兼容旧表：模板绑定列与排序列
  const [vipTplCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'vip_recipients' AND column_name = 'template_id'`
  );
  if (vipTplCol.length === 0) {
    await p.query('ALTER TABLE vip_recipients ADD COLUMN template_id INT NULL');
    // 存量收件人归到第一个模板，避免游离数据
    await p.query(
      'UPDATE vip_recipients SET template_id = (SELECT MIN(id) FROM report_templates) WHERE template_id IS NULL'
    );
    await p.query('ALTER TABLE vip_recipients MODIFY COLUMN template_id INT NOT NULL');
  }
  // 兼容旧表：排序列
  const [vipSortCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'vip_recipients' AND column_name = 'sort_order'`
  );
  if (vipSortCol.length === 0) {
    await p.query('ALTER TABLE vip_recipients ADD COLUMN sort_order INT NOT NULL DEFAULT 0');
  }
  // 周报邮件配置（单行，id 固定为 1；主题留空时前端按默认规则生成）
  await p.query(`CREATE TABLE IF NOT EXISTS weekly_mail_config (
    id INT PRIMARY KEY,
    subject VARCHAR(255),
    signature TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // 周报邮件发送记录
  await p.query(`CREATE TABLE IF NOT EXISTS weekly_mail_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(255),
    to_addr TEXT,
    cc_addr TEXT,
    bcc_addr TEXT,
    attachment VARCHAR(255),
    status VARCHAR(16) NOT NULL,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // 兼容旧表：附件名记录列
  const [wkAttachCol] = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'weekly_mail_logs' AND column_name = 'attachment'`
  );
  if (wkAttachCol.length === 0) {
    await p.query('ALTER TABLE weekly_mail_logs ADD COLUMN attachment VARCHAR(255) NULL');
  }
}
