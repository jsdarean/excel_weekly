# 工程周报管理网页应用 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个本地网页应用（端口 3001），将《周报本周进展.xlsx》导入本机 MySQL，支持合并数据筛选展示、按周增量导入（重复周覆盖前确认）、人员配置增删改。

**Architecture:** Express REST API（`server/`）+ Vue3/Vite SPA（`web/`），生产模式由 Express 托管 `web/dist`，单进程单端口 3001。MySQL 库 `weekly_report` 三张表：`projects`（基础数据，B–J 列）、`weekly_progress`（周进展，L–Q 列 + report_date）、`persons`（人员）。

**Tech Stack:** Node.js + Express 4 + mysql2 + SheetJS(xlsx) + multer；Vue3 + Vite + vue-router；Vitest + supertest 测试。

**Spec:** `docs/superpowers/specs/2026-08-20-weekly-report-app-design.md`

## Global Constraints

- 服务端口固定 **3001**；MySQL 库名 `weekly_report`（测试库 `weekly_report_test`）。
- MySQL 连接配置在 `server/.env`（`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`），代码默认 localhost:3306/root。
- 只解析 Excel 第一个工作表；A 列"序号"忽略；K 列（上周进展）不导入。
- 匹配键为项目编码（C 列）；`weekly_progress` 唯一键 `(project_code, report_date)`。
- 无登录鉴权；人员表与项目数据不关联。
- 所有 API 错误响应格式：`{ "error": "message" }`。
- 提交信息用中文、conventional commits 风格（如 `feat: ...` / `test: ...`）。

## 文件结构

```
server/
├── package.json            # type: module；deps: express/mysql2/xlsx/multer/dotenv；dev: vitest/supertest
├── vitest.config.js        # setupFiles + 单 fork 顺序执行
├── .env.example
├── src/
│   ├── db.js               # getPool() / initDatabase() / DB_NAME；建库建表
│   ├── excel.js            # parseWeeklyReport(buffer)、parseHeaderDate(header)
│   ├── importService.js    # hasProgressForDate(pool, date)、importData(pool, parsed, date)
│   ├── app.js              # createApp()：挂载路由 + 托管 web/dist
│   ├── index.js            # 入口：initDatabase() 后 listen(3001)
│   └── routes/
│       ├── import.js       # POST /api/import（multer 内存存储）
│       ├── reports.js      # GET /api/reports、/api/report-dates、/api/filters
│       └── persons.js      # GET/POST /api/persons、PUT/DELETE /api/persons/:id
└── test/
    ├── setup.js            # 设置 DB_NAME=weekly_report_test
    ├── helpers/db.js       # resetDb()：initDatabase + 清空三表
    ├── db.test.js
    ├── excel.test.js
    ├── importService.test.js
    ├── importApi.test.js
    ├── reportsApi.test.js
    └── personsApi.test.js
web/
├── package.json            # deps: vue/vue-router/xlsx；dev: vite/@vitejs/plugin-vue/vitest
├── vite.config.js          # vue 插件 + /api 代理 3001 + vitest 配置
├── index.html
└── src/
    ├── main.js             # 挂载 App + router
    ├── router.js           # 三个路由：/ /import /persons
    ├── api.js              # buildQuery(params)、api.{getReports,getReportDates,getFilters,importReport,listPersons,createPerson,updatePerson,deletePerson}
    ├── importFlow.js       # importWithConfirm(file, reportDate, confirmFn)：409 时确认后覆盖重发
    ├── App.vue             # 顶部导航 + router-view
    ├── api.test.js
    ├── importFlow.test.js
    └── views/
        ├── ReportList.vue  # 周报列表页
        ├── ImportView.vue  # 导入页
        └── PersonsView.vue # 人员配置页
```

**关键接口约定（跨任务一致）：**

- `parseWeeklyReport(buffer)` 返回 `{ projects, progress, headerDate, skipped }`：
  - `projects[i]`：`{ projectCode, categoryMajor, projectName, approvalDate, category, owner, budgetWan, stage, content }`
  - `progress[i]`：`{ projectCode, progress, purchaseRate, disclosure, arrivalRate, onlineHandover, finalAcceptance }`
  - `headerDate`：`'YYYY-MM-DD'` 或 `null`；`skipped`：有内容但项目编码为空的行数。
- `hasProgressForDate(pool, reportDate)` → `boolean`；`importData(pool, parsed, reportDate)` → `{ inserted, updated, progressWritten }`。
- API 行数据直接用数据库 snake_case 字段名返回（前端按 snake_case 渲染）。
- 前端 `importWithConfirm(file, reportDate, confirmFn)`：`confirmFn(message)` 返回 truthy 则以 `overwrite=true` 重发；用户取消返回 `null`。

---

### Task 1: 后端脚手架 + 数据库初始化

**Files:**
- Create: `server/package.json`、`server/vitest.config.js`、`server/.env.example`、`server/src/db.js`、`server/test/setup.js`、`server/test/helpers/db.js`、`server/test/db.test.js`

**Interfaces:**
- Produces: `getPool()` → mysql2 Pool（`dateStrings: true`，DATE 返回 `'YYYY-MM-DD'`）；`initDatabase()` → 建库 + 建三表（幂等）；`DB_NAME` 常量；`resetDb()`（测试用：initDatabase + DELETE 三表）。

- [ ] **Step 1: 写 server/package.json 与测试配置**

`server/package.json`：

```json
{
  "name": "weekly-report-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "mysql2": "^3.11.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vitest": "^2.0.5"
  }
}
```

`server/vitest.config.js`：

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    testTimeout: 20000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

`server/.env.example`：

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
```

`server/test/setup.js`（在 dotenv 之前设好测试库名；dotenv 不覆盖已存在的环境变量）：

```js
process.env.DB_NAME = 'weekly_report_test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
```

执行 `cd server && npm install`。然后在 `server/` 下复制 `.env.example` 为 `.env` 并填入本机 MySQL 密码（后续所有任务依赖它）。

- [ ] **Step 2: 写失败测试 test/db.test.js 和 test/helpers/db.js**

`server/test/helpers/db.js`：

```js
import { getPool, initDatabase } from '../../src/db.js';

export async function resetDb() {
  await initDatabase();
  const pool = getPool();
  await pool.query('DELETE FROM weekly_progress');
  await pool.query('DELETE FROM projects');
  await pool.query('DELETE FROM persons');
}
```

`server/test/db.test.js`：

```js
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
      'persons',
      'projects',
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
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd server && npx vitest run test/db.test.js`
Expected: FAIL（`../src/db.js` 不存在）

- [ ] **Step 4: 实现 src/db.js**

```js
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
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd server && npx vitest run test/db.test.js`
Expected: PASS（2 个用例）

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: 后端脚手架与 MySQL 建库建表"
```

---

### Task 2: Excel 解析模块 excel.js

**Files:**
- Create: `server/src/excel.js`、`server/test/excel.test.js`

**Interfaces:**
- Consumes: 无（纯函数，依赖 `xlsx` 包）。
- Produces: `parseHeaderDate(header)` → `'YYYY-MM-DD' | null`；`parseWeeklyReport(buffer)` → `{ projects, progress, headerDate, skipped }`（字段名见"关键接口约定"）。

- [ ] **Step 1: 写失败测试 test/excel.test.js**

测试内用 SheetJS 现场构造一个 17 列表头（A–Q）+ 3 行数据的工作簿，避免依赖真实文件：

```js
import { describe, it, expect } from 'vitest';
import xlsx from 'xlsx';
import { parseHeaderDate, parseWeeklyReport } from '../src/excel.js';

function buildBuffer(rows) {
  const header = [
    '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
    '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
    '周进展(20260814)', '周进展（20260821）', '主设备请购完成率',
    '是否交底', '主设备到货完成率', '是否上线交维', '是否竣工验收',
  ];
  const ws = xlsx.utils.aoa_to_sheet([header, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '测试');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('parseHeaderDate', () => {
  it('从表头解析 8 位日期', () => {
    expect(parseHeaderDate('周进展（20260821）')).toBe('2026-08-21');
  });
  it('无日期返回 null', () => {
    expect(parseHeaderDate('周进展')).toBeNull();
    expect(parseHeaderDate(null)).toBeNull();
  });
});

describe('parseWeeklyReport', () => {
  it('B-J 映射到 projects，L-Q 映射到 progress，K 列忽略', () => {
    const buf = buildBuffer([
      [1, '业务网', 'P001', '项目甲', new Date(2025, 8, 9), '基础能力',
       '张三', 320, '项目实施阶段', '建设内容甲',
       '上周进展忽略', '本周进展甲', 0.85, '是', 0.8, '否', '否'],
    ]);
    const r = parseWeeklyReport(buf);
    expect(r.headerDate).toBe('2026-08-21');
    expect(r.skipped).toBe(0);
    expect(r.projects).toEqual([
      {
        projectCode: 'P001', categoryMajor: '业务网', projectName: '项目甲',
        approvalDate: '2025-09-09', category: '基础能力', owner: '张三',
        budgetWan: 320, stage: '项目实施阶段', content: '建设内容甲',
      },
    ]);
    expect(r.progress).toEqual([
      {
        projectCode: 'P001', progress: '本周进展甲', purchaseRate: 0.85,
        disclosure: '是', arrivalRate: 0.8, onlineHandover: '否',
        finalAcceptance: '否',
      },
    ]);
  });

  it('项目编码为空但有内容的行计入 skipped，完全空白行不计', () => {
    const buf = buildBuffer([
      [2, null, null, '无编码项目', null, null, null, null, null, null,
       null, '有进展', null, null, null, null, null],
      [3, '业务网', 'P002', '项目乙', null, null, null, null, null, null,
       null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null,
       null, null, null, null, null, null, null],
    ]);
    const r = parseWeeklyReport(buf);
    expect(r.skipped).toBe(1);
    expect(r.projects.map((p) => p.projectCode)).toEqual(['P002']);
    expect(r.progress[0].progress).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run test/excel.test.js`
Expected: FAIL（`../src/excel.js` 不存在）

- [ ] **Step 3: 实现 src/excel.js**

列索引（0 基）：B=1 专业类别，C=2 项目编码，D=3 项目名称，E=4 立项批复日期，F=5 分类，G=6 工程责任人，H=7 立项金额，I=8 项目阶段，J=9 建设内容，K=10 上周进展（忽略），L=11 本周进展，M=12 请购完成率，N=13 是否交底，O=14 到货完成率，P=15 是否上线交维，Q=16 是否竣工验收。

```js
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
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd server && npx vitest run test/excel.test.js`
Expected: PASS（4 个用例）

- [ ] **Step 5: Commit**

```bash
git add server/src/excel.js server/test/excel.test.js
git commit -m "feat: Excel 周报解析模块（B-J/L-Q 列映射）"
```

---

### Task 3: 导入服务 importService.js

**Files:**
- Create: `server/src/importService.js`、`server/test/importService.test.js`

**Interfaces:**
- Consumes: `getPool()`（Task 1）；`parseWeeklyReport` 的返回结构（Task 2）。
- Produces: `hasProgressForDate(pool, reportDate)` → boolean；`importData(pool, parsed, reportDate)` → `{ inserted, updated, progressWritten }`。

- [ ] **Step 1: 写失败测试 test/importService.test.js**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';
import { hasProgressForDate, importData } from '../src/importService.js';

const parsed = {
  projects: [
    {
      projectCode: 'P001', categoryMajor: '业务网', projectName: '项目甲',
      approvalDate: '2025-09-09', category: '基础能力', owner: '张三',
      budgetWan: 320, stage: '项目实施阶段', content: '内容甲',
    },
  ],
  progress: [
    {
      projectCode: 'P001', progress: '第一周进展', purchaseRate: 0.5,
      disclosure: '是', arrivalRate: 0.4, onlineHandover: '否',
      finalAcceptance: '否',
    },
  ],
  headerDate: '2026-08-21',
  skipped: 0,
};

describe('importData', () => {
  beforeEach(resetDb);

  it('首次导入：inserted=1, updated=0, progressWritten=1', async () => {
    const stats = await importData(getPool(), parsed, '2026-08-21');
    expect(stats).toEqual({ inserted: 1, updated: 0, progressWritten: 1 });
    const [p] = await getPool().query('SELECT * FROM projects');
    expect(p[0].project_name).toBe('项目甲');
    expect(p[0].approval_date).toBe('2025-09-09');
    const [w] = await getPool().query('SELECT * FROM weekly_progress');
    expect(w[0].report_date).toBe('2026-08-21');
  });

  it('再次导入：基础数据更新（updated=1），同周进展覆盖', async () => {
    await importData(getPool(), parsed, '2026-08-21');
    const parsed2 = structuredClone(parsed);
    parsed2.projects[0].stage = '工程验收阶段';
    parsed2.progress[0].progress = '修正后的进展';
    const stats = await importData(getPool(), parsed2, '2026-08-21');
    expect(stats).toEqual({ inserted: 0, updated: 1, progressWritten: 1 });
    const [p] = await getPool().query('SELECT stage FROM projects');
    expect(p[0].stage).toBe('工程验收阶段');
    const [w] = await getPool().query('SELECT progress FROM weekly_progress');
    expect(w).toHaveLength(1);
    expect(w[0].progress).toBe('修正后的进展');
  });

  it('不同周各自成记录，互不影响', async () => {
    await importData(getPool(), parsed, '2026-08-21');
    await importData(getPool(), parsed, '2026-08-28');
    const [w] = await getPool().query(
      'SELECT report_date FROM weekly_progress ORDER BY report_date'
    );
    expect(w.map((r) => r.report_date)).toEqual(['2026-08-21', '2026-08-28']);
  });
});

describe('hasProgressForDate', () => {
  beforeEach(resetDb);

  it('有记录返回 true，无记录返回 false', async () => {
    expect(await hasProgressForDate(getPool(), '2026-08-21')).toBe(false);
    await importData(getPool(), parsed, '2026-08-21');
    expect(await hasProgressForDate(getPool(), '2026-08-21')).toBe(true);
    expect(await hasProgressForDate(getPool(), '2026-08-28')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run test/importService.test.js`
Expected: FAIL（`../src/importService.js` 不存在）

- [ ] **Step 3: 实现 src/importService.js**

```js
export async function hasProgressForDate(pool, reportDate) {
  const [rows] = await pool.query(
    'SELECT 1 AS x FROM weekly_progress WHERE report_date = ? LIMIT 1',
    [reportDate]
  );
  return rows.length > 0;
}

export async function importData(pool, parsed, reportDate) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let inserted = 0;
    let updated = 0;
    for (const p of parsed.projects) {
      const [r] = await conn.query(
        `INSERT INTO projects
           (project_code, category_major, project_name, approval_date,
            category, owner, budget_wan, stage, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           category_major = VALUES(category_major),
           project_name = VALUES(project_name),
           approval_date = VALUES(approval_date),
           category = VALUES(category),
           owner = VALUES(owner),
           budget_wan = VALUES(budget_wan),
           stage = VALUES(stage),
           content = VALUES(content)`,
        [p.projectCode, p.categoryMajor, p.projectName, p.approvalDate,
         p.category, p.owner, p.budgetWan, p.stage, p.content]
      );
      if (r.affectedRows === 1) inserted++;
      else if (r.affectedRows === 2) updated++;
    }
    let progressWritten = 0;
    for (const w of parsed.progress) {
      await conn.query(
        `INSERT INTO weekly_progress
           (project_code, report_date, progress, purchase_rate, disclosure,
            arrival_rate, online_handover, final_acceptance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           progress = VALUES(progress),
           purchase_rate = VALUES(purchase_rate),
           disclosure = VALUES(disclosure),
           arrival_rate = VALUES(arrival_rate),
           online_handover = VALUES(online_handover),
           final_acceptance = VALUES(final_acceptance)`,
        [w.projectCode, reportDate, w.progress, w.purchaseRate, w.disclosure,
         w.arrivalRate, w.onlineHandover, w.finalAcceptance]
      );
      progressWritten++;
    }
    await conn.commit();
    return { inserted, updated, progressWritten };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
```

注意：mysql2 的 `ON DUPLICATE KEY UPDATE` 在值未变化时 `affectedRows` 可能为 0（而非 2），此时既不算 insert 也不算 update，统计可接受；行为以测试断言为准。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd server && npx vitest run test/importService.test.js`
Expected: PASS（4 个用例）

- [ ] **Step 5: Commit**

```bash
git add server/src/importService.js server/test/importService.test.js
git commit -m "feat: 导入服务（基础数据/周进展 upsert + 覆盖检测）"
```

---

### Task 4: 导入 API 路由（POST /api/import）

**Files:**
- Create: `server/src/routes/import.js`、`server/src/app.js`、`server/src/index.js`、`server/test/importApi.test.js`

**Interfaces:**
- Consumes: `parseWeeklyReport`（Task 2）、`hasProgressForDate`/`importData`（Task 3）、`getPool`（Task 1）。
- Produces: `createApp()` → Express app（后续路由任务都挂在这里）；`POST /api/import`：multipart 字段 `file`（Excel）、`report_date`（可选，缺省用表头解析）、`overwrite`（`'true'`/`'false'`）。成功返回 `{ reportDate, inserted, updated, progressWritten, skipped }`；重复周且未确认返回 409 `{ error, conflict: true }`。

- [ ] **Step 1: 写失败测试 test/importApi.test.js**

用 SheetJS 构造测试工作簿 buffer（与 Task 2 相同的构造方式）：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

function buildBuffer() {
  const header = [
    '序号', '专业类别', '项目编码', '项目名称', '立项批复日期', '分类',
    '工程责任人', '立项金额（万元）', '项目阶段', '建设内容',
    '周进展(20260814)', '周进展（20260821）', '主设备请购完成率',
    '是否交底', '主设备到货完成率', '是否上线交维', '是否竣工验收',
  ];
  const row = [
    1, '业务网', 'P001', '项目甲', '2025-09-09', '基础能力',
    '张三', 320, '项目实施阶段', '内容甲',
    '上周', '本周', 0.85, '是', 0.8, '否', '否',
  ];
  const ws = xlsx.utils.aoa_to_sheet([header, row]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, '测试');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('POST /api/import', () => {
  beforeEach(resetDb);

  it('不传 report_date 时用表头解析的日期导入', async () => {
    const res = await request(createApp())
      .post('/api/import')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reportDate: '2026-08-21', inserted: 1, updated: 0,
      progressWritten: 1, skipped: 0,
    });
  });

  it('同一 report_date 重复导入返回 409，带 overwrite=true 后覆盖', async () => {
    await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    const again = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(again.status).toBe(409);
    expect(again.body.conflict).toBe(true);
    const overwrite = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026-08-21')
      .field('overwrite', 'true')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(overwrite.status).toBe(200);
    const [w] = await getPool().query('SELECT COUNT(*) AS n FROM weekly_progress');
    expect(w[0].n).toBe(1);
  });

  it('缺少文件返回 400；report_date 格式非法返回 400', async () => {
    const noFile = await request(createApp()).post('/api/import');
    expect(noFile.status).toBe(400);
    expect(noFile.body.error).toBeTruthy();
    const badDate = await request(createApp())
      .post('/api/import')
      .field('report_date', '2026/08/21')
      .attach('file', buildBuffer(), 'weekly.xlsx');
    expect(badDate.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run test/importApi.test.js`
Expected: FAIL（`../src/app.js` 不存在）

- [ ] **Step 3: 实现 src/app.js、src/index.js 与 src/routes/import.js**

`server/src/index.js`（服务入口）：

```js
import { initDatabase } from './db.js';
import { createApp } from './app.js';

initDatabase()
  .then(() => {
    createApp().listen(3001, () => {
      console.log('listening on http://localhost:3001');
    });
  })
  .catch((e) => {
    console.error(`数据库初始化失败，请检查 server/.env 配置：${e.message}`);
    process.exit(1);
  });
```

`server/src/app.js`（先只挂导入路由，后续任务往这里加路由）：

```js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import importRouter from './routes/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/import', importRouter);

  // 生产模式：托管前端构建产物，非 /api 的 GET 回退到 index.html
  const dist = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
  return app;
}
```

`server/src/routes/import.js`：

```js
import { Router } from 'express';
import multer from 'multer';
import { getPool } from '../db.js';
import { parseWeeklyReport } from '../excel.js';
import { hasProgressForDate, importData } from '../importService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });
    let parsed;
    try {
      parsed = parseWeeklyReport(req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'Excel 解析失败，请确认文件格式' });
    }
    const reportDate = req.body.report_date || parsed.headerDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate || '')) {
      return res
        .status(400)
        .json({ error: '周报时间缺失或格式非法（需 YYYY-MM-DD）' });
    }
    const overwrite = req.body.overwrite === 'true';
    if (!overwrite && (await hasProgressForDate(getPool(), reportDate))) {
      return res.status(409).json({
        error: `周报时间 ${reportDate} 已导入过，再次导入将覆盖该周数据`,
        conflict: true,
      });
    }
    const stats = await importData(getPool(), parsed, reportDate);
    res.json({ reportDate, ...stats, skipped: parsed.skipped });
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd server && npx vitest run test/importApi.test.js`
Expected: PASS（3 个用例）

- [ ] **Step 5: Commit**

```bash
git add server/src/app.js server/src/index.js server/src/routes/import.js server/test/importApi.test.js
git commit -m "feat: 导入 API（上传/表头日期/409 覆盖确认）"
```

---

### Task 5: 查询 API（reports / report-dates / filters）

**Files:**
- Create: `server/src/routes/reports.js`、`server/test/reportsApi.test.js`
- Modify: `server/src/app.js`（挂载 reports 路由）

**Interfaces:**
- Consumes: `createApp()`（Task 4）、`getPool()`、`resetDb()`。
- Produces:
  - `GET /api/reports?report_date=&category=&owner=&stage=` → `{ reportDate, rows }`；`report_date` 缺省取最新一周；rows 为 projects LEFT JOIN weekly_progress，snake_case 字段。
  - `GET /api/report-dates` → `{ dates: ['YYYY-MM-DD', ...] }`（降序）。
  - `GET /api/filters` → `{ categories: [...], owners: [...], stages: [...] }`。

- [ ] **Step 1: 写失败测试 test/reportsApi.test.js**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

async function seed() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO projects (project_code, project_name, category, owner, stage)
     VALUES ('P001', '项目甲', '基础能力', '张三', '项目实施阶段'),
            ('P002', '项目乙', '支撑后端', '李四', '勘察设计阶段')`
  );
  await pool.query(
    `INSERT INTO weekly_progress (project_code, report_date, progress)
     VALUES ('P001', '2026-08-14', 'P001上周'),
            ('P001', '2026-08-21', 'P001本周'),
            ('P002', '2026-08-21', 'P002本周')`
  );
}

describe('GET /api/reports', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('缺省 report_date 取最新一周，返回合并数据', async () => {
    const res = await request(createApp()).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.reportDate).toBe('2026-08-21');
    expect(res.body.rows).toHaveLength(2);
    const p1 = res.body.rows.find((r) => r.project_code === 'P001');
    expect(p1.progress).toBe('P001本周');
    expect(p1.owner).toBe('张三');
  });

  it('可指定 report_date 查历史周', async () => {
    const res = await request(createApp())
      .get('/api/reports')
      .query({ report_date: '2026-08-14' });
    expect(res.body.reportDate).toBe('2026-08-14');
    const p1 = res.body.rows.find((r) => r.project_code === 'P001');
    expect(p1.progress).toBe('P001上周');
  });

  it('category/owner/stage 组合筛选', async () => {
    const res = await request(createApp())
      .get('/api/reports')
      .query({ category: '基础能力', owner: '张三', stage: '项目实施阶段' });
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].project_code).toBe('P001');
    const none = await request(createApp())
      .get('/api/reports')
      .query({ category: '基础能力', owner: '李四' });
    expect(none.body.rows).toHaveLength(0);
  });
});

describe('GET /api/report-dates 和 /api/filters', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it('report-dates 降序返回', async () => {
    const res = await request(createApp()).get('/api/report-dates');
    expect(res.body.dates).toEqual(['2026-08-21', '2026-08-14']);
  });

  it('filters 返回 distinct 选项', async () => {
    const res = await request(createApp()).get('/api/filters');
    expect(res.body.categories).toEqual(['基础能力', '支撑后端']);
    expect(res.body.owners).toEqual(['张三', '李四']);
    expect(res.body.stages).toEqual(['勘察设计阶段', '项目实施阶段']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run test/reportsApi.test.js`
Expected: FAIL（`../src/routes/reports.js` 不存在）

- [ ] **Step 3: 实现 src/routes/reports.js 并挂载**

```js
import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/reports', async (req, res) => {
  try {
    const pool = getPool();
    let reportDate = req.query.report_date || null;
    if (!reportDate) {
      const [r] = await pool.query(
        'SELECT MAX(report_date) AS d FROM weekly_progress'
      );
      reportDate = r[0].d;
      if (!reportDate) return res.json({ reportDate: null, rows: [] });
    }
    const conds = [];
    const params = [reportDate];
    if (req.query.category) {
      conds.push('p.category = ?');
      params.push(req.query.category);
    }
    if (req.query.owner) {
      conds.push('p.owner = ?');
      params.push(req.query.owner);
    }
    if (req.query.stage) {
      conds.push('p.stage = ?');
      params.push(req.query.stage);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT p.id, p.project_code, p.category_major, p.project_name,
              p.approval_date, p.category, p.owner, p.budget_wan, p.stage,
              p.content,
              w.report_date, w.progress, w.purchase_rate, w.disclosure,
              w.arrival_rate, w.online_handover, w.final_acceptance
       FROM projects p
       LEFT JOIN weekly_progress w
         ON w.project_code = p.project_code AND w.report_date = ?
       ${where}
       ORDER BY p.project_code`,
      params
    );
    res.json({ reportDate, rows });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

router.get('/report-dates', async (req, res) => {
  const [rows] = await getPool().query(
    'SELECT DISTINCT report_date FROM weekly_progress ORDER BY report_date DESC'
  );
  res.json({ dates: rows.map((r) => r.report_date) });
});

router.get('/filters', async (req, res) => {
  const pool = getPool();
  const [cats] = await pool.query(
    "SELECT DISTINCT category FROM projects WHERE category IS NOT NULL AND category <> '' ORDER BY category"
  );
  const [owners] = await pool.query(
    "SELECT DISTINCT owner FROM projects WHERE owner IS NOT NULL AND owner <> '' ORDER BY owner"
  );
  const [stages] = await pool.query(
    "SELECT DISTINCT stage FROM projects WHERE stage IS NOT NULL AND stage <> '' ORDER BY stage"
  );
  res.json({
    categories: cats.map((r) => r.category),
    owners: owners.map((r) => r.owner),
    stages: stages.map((r) => r.stage),
  });
});

export default router;
```

修改 `server/src/app.js`：在 import 区加 `import reportsRouter from './routes/reports.js';`，在 `app.use('/api/import', importRouter);` 之后加 `app.use('/api', reportsRouter);`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd server && npx vitest run test/reportsApi.test.js`
Expected: PASS（5 个用例）

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/reports.js server/src/app.js server/test/reportsApi.test.js
git commit -m "feat: 周报查询/筛选选项 API"
```

---

### Task 6: 人员 CRUD API

**Files:**
- Create: `server/src/routes/persons.js`、`server/test/personsApi.test.js`
- Modify: `server/src/app.js`（挂载 persons 路由）

**Interfaces:**
- Consumes: `createApp()`、`getPool()`、`resetDb()`。
- Produces: `GET /api/persons` → `{ persons: [{id,name,phone,short_number,email,...}] }`；`POST /api/persons` body `{name, phone?, shortNumber?, email?}`；`PUT /api/persons/:id` 同 body；`DELETE /api/persons/:id` → 204。name 为空返回 400。

- [ ] **Step 1: 写失败测试 test/personsApi.test.js**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';

describe('/api/persons', () => {
  beforeEach(resetDb);

  it('新增 → 列表 → 修改 → 删除 全流程', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/persons')
      .send({ name: '张三', phone: '13800000000', shortNumber: '61001', email: 'zs@example.com' });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const list = await request(app).get('/api/persons');
    expect(list.body.persons).toHaveLength(1);
    expect(list.body.persons[0]).toMatchObject({
      name: '张三', phone: '13800000000',
      short_number: '61001', email: 'zs@example.com',
    });

    const updated = await request(app)
      .put(`/api/persons/${id}`)
      .send({ name: '张三', phone: '13900000000', shortNumber: '61001', email: 'zs@example.com' });
    expect(updated.status).toBe(200);
    const list2 = await request(app).get('/api/persons');
    expect(list2.body.persons[0].phone).toBe('13900000000');

    const del = await request(app).delete(`/api/persons/${id}`);
    expect(del.status).toBe(204);
    const list3 = await request(app).get('/api/persons');
    expect(list3.body.persons).toHaveLength(0);
  });

  it('name 为空返回 400；更新不存在的 id 返回 404', async () => {
    const app = createApp();
    const bad = await request(app).post('/api/persons').send({ name: '' });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .put('/api/persons/999')
      .send({ name: '李四' });
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run test/personsApi.test.js`
Expected: FAIL（`../src/routes/persons.js` 不存在）

- [ ] **Step 3: 实现 src/routes/persons.js 并挂载**

```js
import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

function validate(body) {
  if (!body || !String(body.name ?? '').trim()) {
    return '姓名不能为空';
  }
  return null;
}

router.get('/', async (req, res) => {
  const [rows] = await getPool().query(
    'SELECT id, name, phone, short_number, email FROM persons ORDER BY id'
  );
  res.json({ persons: rows });
});

router.post('/', async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, phone = null, shortNumber = null, email = null } = req.body;
  const [r] = await getPool().query(
    'INSERT INTO persons (name, phone, short_number, email) VALUES (?, ?, ?, ?)',
    [String(name).trim(), phone, shortNumber, email]
  );
  res.status(201).json({ id: r.insertId });
});

router.put('/:id', async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, phone = null, shortNumber = null, email = null } = req.body;
  const [r] = await getPool().query(
    'UPDATE persons SET name = ?, phone = ?, short_number = ?, email = ? WHERE id = ?',
    [String(name).trim(), phone, shortNumber, email, req.params.id]
  );
  if (r.affectedRows === 0) return res.status(404).json({ error: '人员不存在' });
  res.json({ id: Number(req.params.id) });
});

router.delete('/:id', async (req, res) => {
  const [r] = await getPool().query('DELETE FROM persons WHERE id = ?', [
    req.params.id,
  ]);
  if (r.affectedRows === 0) return res.status(404).json({ error: '人员不存在' });
  res.status(204).end();
});

export default router;
```

修改 `server/src/app.js`：import 区加 `import personsRouter from './routes/persons.js';`，路由区加 `app.use('/api/persons', personsRouter);`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd server && npx vitest run test/personsApi.test.js`
Expected: PASS（2 个用例）。同时跑 `npx vitest run` 确认全部通过。

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/persons.js server/src/app.js server/test/personsApi.test.js
git commit -m "feat: 人员配置 CRUD API"
```

---

### Task 7: 前端脚手架 + api.js

**Files:**
- Create: `web/package.json`、`web/vite.config.js`、`web/index.html`、`web/src/main.js`、`web/src/router.js`、`web/src/App.vue`、`web/src/api.js`、`web/src/api.test.js`

**Interfaces:**
- Consumes: 后端 API（Task 4–6）。
- Produces: `buildQuery(params)` → `'?a=1&b=2'`（空值跳过）；`api` 对象（方法签名见下）；路由 `/`（周报列表）、`/import`、`/persons`。

`api` 对象方法：
```js
api.getReports(params)              // GET /api/reports + buildQuery(params)
api.getReportDates()                // GET /api/report-dates
api.getFilters()                    // GET /api/filters
api.importReport(file, reportDate, overwrite)  // POST /api/import (FormData)
api.listPersons()                   // GET /api/persons
api.createPerson(p)                 // POST /api/persons
api.updatePerson(id, p)             // PUT /api/persons/:id
api.deletePerson(id)                // DELETE /api/persons/:id
```
错误处理约定：非 2xx 时抛 `Error`，`err.message` 取响应体 `error`，`err.status` 为 HTTP 状态码。

- [ ] **Step 1: 写脚手架文件与失败测试**

`web/package.json`：

```json
{
  "name": "weekly-report-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "vue": "^3.4.38",
    "vue-router": "^4.4.3",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.2",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

`web/vite.config.js`：

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: { environment: 'node' },
});
```

`web/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>工程周报管理</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`web/src/main.js`：

```js
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';

createApp(App).use(router).mount('#app');
```

`web/src/router.js`（视图组件由 Task 8–10 创建，本任务先建占位以便路由可用）：

```js
import { createRouter, createWebHistory } from 'vue-router';
import ReportList from './views/ReportList.vue';
import ImportView from './views/ImportView.vue';
import PersonsView from './views/PersonsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ReportList },
    { path: '/import', component: ImportView },
    { path: '/persons', component: PersonsView },
  ],
});
```

`web/src/App.vue`：

```vue
<template>
  <div>
    <nav class="nav">
      <router-link to="/">周报列表</router-link>
      <router-link to="/import">数据导入</router-link>
      <router-link to="/persons">人员配置</router-link>
    </nav>
    <main class="page">
      <router-view />
    </main>
  </div>
</template>

<style>
body { margin: 0; font-family: 'Microsoft YaHei', sans-serif; }
.nav { display: flex; gap: 24px; padding: 12px 24px; background: #1f4e79; }
.nav a { color: #fff; text-decoration: none; }
.nav a.router-link-active { font-weight: bold; border-bottom: 2px solid #fff; }
.page { padding: 16px 24px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f0f4f8; }
button { cursor: pointer; }
</style>
```

`web/src/api.test.js`：

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildQuery, api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

describe('buildQuery', () => {
  it('拼接非空参数，跳过空值', () => {
    expect(buildQuery({ report_date: '2026-08-21', category: '', owner: null, stage: '项目实施阶段' }))
      .toBe('?report_date=2026-08-21&stage=%E9%A1%B9%E7%9B%AE%E5%AE%9E%E6%96%BD%E9%98%B6%E6%AE%B5');
    expect(buildQuery({})).toBe('');
  });
});

describe('api.importReport', () => {
  it('发送 FormData 并携带 overwrite 标志', async () => {
    const fake = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reportDate: '2026-08-21' }),
    });
    vi.stubGlobal('fetch', fake);
    const file = new File(['x'], 'weekly.xlsx');
    await api.importReport(file, '2026-08-21', true);
    const [url, opts] = fake.mock.calls[0];
    expect(url).toBe('/api/import');
    expect(opts.method).toBe('POST');
    expect(opts.body.get('report_date')).toBe('2026-08-21');
    expect(opts.body.get('overwrite')).toBe('true');
    expect(opts.body.get('file')).toBeInstanceOf(File);
  });

  it('非 2xx 抛出带 status 和 error 信息的 Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: '本周已导入过' }),
    }));
    const err = await api.importReport(new File(['x'], 'a.xlsx'), '2026-08-21', false).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.message).toBe('本周已导入过');
  });
});
```

执行 `cd web && npm install`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx vitest run src/api.test.js`
Expected: FAIL（`./api.js` 不存在）

- [ ] **Step 3: 实现 src/api.js**

```js
export function buildQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `请求失败（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getReports: (params) => request(`/api/reports${buildQuery(params)}`),
  getReportDates: () => request('/api/report-dates'),
  getFilters: () => request('/api/filters'),
  importReport(file, reportDate, overwrite) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('report_date', reportDate);
    fd.append('overwrite', overwrite ? 'true' : 'false');
    return request('/api/import', { method: 'POST', body: fd });
  },
  listPersons: () => request('/api/persons'),
  createPerson: (p) =>
    request('/api/persons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),
  updatePerson: (id, p) =>
    request(`/api/persons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }),
  deletePerson: (id) => request(`/api/persons/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && npx vitest run src/api.test.js`
Expected: PASS（3 个用例）

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: 前端脚手架（Vite/Vue3/路由/api 封装）"
```

---

### Task 8: 周报列表页 ReportList.vue

**Files:**
- Create: `web/src/views/ReportList.vue`

**Interfaces:**
- Consumes: `api.getReports(params)`、`api.getReportDates()`、`api.getFilters()`（Task 7）。返回行字段为 snake_case：`project_code / category_major / project_name / approval_date / category / owner / budget_wan / stage / content / report_date / progress / purchase_rate / disclosure / arrival_rate / online_handover / final_acceptance`。
- Produces: 路由 `/` 的页面。

- [ ] **Step 1: 实现 ReportList.vue**

```vue
<template>
  <div>
    <div class="filters">
      <label>周报时间
        <select v-model="filters.report_date" @change="load">
          <option v-for="d in dates" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label>分类
        <select v-model="filters.category" @change="load">
          <option value="">全部</option>
          <option v-for="c in options.categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label>工程责任人
        <select v-model="filters.owner" @change="load">
          <option value="">全部</option>
          <option v-for="o in options.owners" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>
      <label>项目阶段
        <select v-model="filters.stage" @change="load">
          <option value="">全部</option>
          <option v-for="s in options.stages" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!reportDate">暂无数据，请先到「数据导入」页导入 Excel。</p>
    <table v-else>
      <thead>
        <tr>
          <th>专业类别</th><th>项目编码</th><th>项目名称</th>
          <th>立项批复日期</th><th>分类</th><th>工程责任人</th>
          <th>立项金额（万元）</th><th>项目阶段</th><th>建设内容</th>
          <th>周进展（{{ reportDate }}）</th><th>请购完成率</th>
          <th>是否交底</th><th>到货完成率</th><th>是否上线交维</th>
          <th>是否竣工验收</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.category_major }}</td>
          <td>{{ r.project_code }}</td>
          <td>{{ r.project_name }}</td>
          <td>{{ r.approval_date }}</td>
          <td>{{ r.category }}</td>
          <td>{{ r.owner }}</td>
          <td>{{ r.budget_wan }}</td>
          <td>{{ r.stage }}</td>
          <td class="pre">{{ r.content }}</td>
          <td class="pre">{{ r.progress }}</td>
          <td>{{ fmtRate(r.purchase_rate) }}</td>
          <td>{{ r.disclosure }}</td>
          <td>{{ fmtRate(r.arrival_rate) }}</td>
          <td>{{ r.online_handover }}</td>
          <td>{{ r.final_acceptance }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api.js';

const dates = ref([]);
const options = reactive({ categories: [], owners: [], stages: [] });
const filters = reactive({ report_date: '', category: '', owner: '', stage: '' });
const rows = ref([]);
const reportDate = ref('');
const error = ref('');

function fmtRate(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : v;
}

async function load() {
  error.value = '';
  try {
    const res = await api.getReports({ ...filters });
    rows.value = res.rows;
    reportDate.value = res.reportDate;
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(async () => {
  try {
    const [d, f] = await Promise.all([api.getReportDates(), api.getFilters()]);
    dates.value = d.dates;
    Object.assign(options, f);
    if (d.dates.length) filters.report_date = d.dates[0];
    await load();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.filters { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.filters label { display: flex; align-items: center; gap: 6px; }
.error { color: #c00; }
.pre { white-space: pre-wrap; max-width: 260px; }
</style>
```

- [ ] **Step 2: 手工验证**

Run: 先启动后端 `cd server && npm start`，再 `cd web && npm run dev`，浏览器打开 Vite 提示的地址。
Expected: 页面显示三个导航；周报列表页显示"暂无数据"提示（库为空时），四个筛选下拉渲染正常。

- [ ] **Step 3: Commit**

```bash
git add web/src/views/ReportList.vue
git commit -m "feat: 周报列表页（4 条件筛选 + 合并数据表格）"
```

---

### Task 9: 导入页 ImportView.vue + importFlow.js

**Files:**
- Create: `web/src/importFlow.js`、`web/src/importFlow.test.js`、`web/src/views/ImportView.vue`

**Interfaces:**
- Consumes: `api.importReport`（Task 7）；`xlsx` 包（前端解析 L 列表头预填日期）。
- Produces: `importWithConfirm(file, reportDate, confirmFn)` → 成功返回统计对象；409 时 `confirmFn(message)` 返回 truthy 则以 overwrite=true 重发；用户取消返回 `null`。

- [ ] **Step 1: 写失败测试 src/importFlow.test.js**

```js
import { describe, it, expect, vi } from 'vitest';
import { api } from './api.js';
import { importWithConfirm } from './importFlow.js';

vi.mock('./api.js', () => ({
  api: { importReport: vi.fn() },
}));

describe('importWithConfirm', () => {
  it('一次成功直接返回结果', async () => {
    api.importReport.mockResolvedValue({ reportDate: '2026-08-21' });
    const r = await importWithConfirm('file', '2026-08-21', vi.fn());
    expect(r.reportDate).toBe('2026-08-21');
    expect(api.importReport).toHaveBeenCalledWith('file', '2026-08-21', false);
  });

  it('409 且用户确认 → overwrite=true 重发', async () => {
    const conflict = Object.assign(new Error('本周已导入过'), { status: 409 });
    api.importReport
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ reportDate: '2026-08-21' });
    const confirmFn = vi.fn().mockReturnValue(true);
    const r = await importWithConfirm('file', '2026-08-21', confirmFn);
    expect(confirmFn).toHaveBeenCalledWith('本周已导入过');
    expect(api.importReport).toHaveBeenLastCalledWith('file', '2026-08-21', true);
    expect(r.reportDate).toBe('2026-08-21');
  });

  it('409 且用户取消 → 返回 null，不重发', async () => {
    const conflict = Object.assign(new Error('本周已导入过'), { status: 409 });
    api.importReport.mockRejectedValueOnce(conflict);
    const r = await importWithConfirm('file', '2026-08-21', () => false);
    expect(r).toBeNull();
    expect(api.importReport).toHaveBeenCalledTimes(1);
  });

  it('非 409 错误直接抛出', async () => {
    const boom = Object.assign(new Error('服务器错误'), { status: 500 });
    api.importReport.mockRejectedValueOnce(boom);
    await expect(
      importWithConfirm('file', '2026-08-21', vi.fn())
    ).rejects.toThrow('服务器错误');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx vitest run src/importFlow.test.js`
Expected: FAIL（`./importFlow.js` 不存在）

- [ ] **Step 3: 实现 src/importFlow.js**

```js
import { api } from './api.js';

export async function importWithConfirm(file, reportDate, confirmFn) {
  try {
    return await api.importReport(file, reportDate, false);
  } catch (e) {
    if (e.status === 409) {
      if (await confirmFn(e.message)) {
        return api.importReport(file, reportDate, true);
      }
      return null;
    }
    throw e;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && npx vitest run src/importFlow.test.js`
Expected: PASS（4 个用例）

- [ ] **Step 5: 实现 views/ImportView.vue**

```vue
<template>
  <div>
    <h2>数据导入</h2>
    <div class="form">
      <label>Excel 文件
        <input type="file" accept=".xlsx,.xls" @change="onFile" />
      </label>
      <label>周报时间
        <input type="date" v-model="reportDate" />
      </label>
      <button :disabled="!file || !reportDate || loading" @click="submit">
        {{ loading ? '导入中…' : '导入' }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="result" class="result">
      <p>导入完成（周报时间：{{ result.reportDate }}）：</p>
      <ul>
        <li>新增项目：{{ result.inserted }}</li>
        <li>更新项目：{{ result.updated }}</li>
        <li>写入进展：{{ result.progressWritten }}</li>
        <li>跳过行（无项目编码）：{{ result.skipped }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import xlsx from 'xlsx';
import { importWithConfirm } from '../importFlow.js';

const file = ref(null);
const reportDate = ref('');
const loading = ref(false);
const error = ref('');
const result = ref(null);

async function onFile(e) {
  error.value = '';
  result.value = null;
  file.value = e.target.files[0] || null;
  if (!file.value) return;
  // 从 L 列表头（第 12 列，0 基索引 11）解析日期预填
  try {
    const buf = await file.value.arrayBuffer();
    const wb = xlsx.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, range: 0, blankrows: false });
    const header = rows[0] || [];
    const m = /(\d{4})(\d{2})(\d{2})/.exec(String(header[11] ?? ''));
    if (m) reportDate.value = `${m[1]}-${m[2]}-${m[3]}`;
  } catch {
    /* 预填失败不阻塞，用户可手选日期 */
  }
}

async function submit() {
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const r = await importWithConfirm(file.value, reportDate.value, (msg) =>
      window.confirm(`${msg}\n\n是否覆盖？`)
    );
    if (r) result.value = r;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.form { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }
.error { color: #c00; }
.result { border: 1px solid #9c9; padding: 8px 12px; display: inline-block; }
</style>
```

- [ ] **Step 6: 手工验证**

Run: 后端 `npm start` + 前端 `npm run dev`，打开「数据导入」页。
Expected: 选择《周报本周进展.xlsx》后周报时间自动填为 2026-08-21；点导入显示统计；再次导入同一文件弹出覆盖确认。

- [ ] **Step 7: Commit**

```bash
git add web/src/importFlow.js web/src/importFlow.test.js web/src/views/ImportView.vue
git commit -m "feat: 导入页（日期预填 + 覆盖确认 + 结果统计）"
```

---

### Task 10: 人员配置页 PersonsView.vue

**Files:**
- Create: `web/src/views/PersonsView.vue`

**Interfaces:**
- Consumes: `api.listPersons / createPerson / updatePerson / deletePerson`（Task 7）。人员对象字段：`{ id, name, phone, short_number, email }`；提交 body 用 `{ name, phone, shortNumber, email }`。
- Produces: 路由 `/persons` 的页面。

- [ ] **Step 1: 实现 PersonsView.vue**

```vue
<template>
  <div>
    <h2>人员配置</h2>
    <button @click="openForm(null)">新增人员</button>
    <p v-if="error" class="error">{{ error }}</p>

    <table>
      <thead>
        <tr><th>姓名</th><th>电话</th><th>短号</th><th>邮箱</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id">
          <td>{{ p.name }}</td>
          <td>{{ p.phone }}</td>
          <td>{{ p.short_number }}</td>
          <td>{{ p.email }}</td>
          <td>
            <button @click="openForm(p)">编辑</button>
            <button @click="remove(p)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="editing" class="modal">
      <div class="dialog">
        <h3>{{ editing.id ? '编辑人员' : '新增人员' }}</h3>
        <label>姓名 <input v-model="editing.name" /></label>
        <label>电话 <input v-model="editing.phone" /></label>
        <label>短号 <input v-model="editing.shortNumber" /></label>
        <label>邮箱 <input v-model="editing.email" /></label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div>
          <button @click="save">保存</button>
          <button @click="editing = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';

const persons = ref([]);
const editing = ref(null);
const error = ref('');
const formError = ref('');

async function load() {
  try {
    persons.value = (await api.listPersons()).persons;
  } catch (e) {
    error.value = e.message;
  }
}

function openForm(p) {
  formError.value = '';
  editing.value = p
    ? { id: p.id, name: p.name, phone: p.phone ?? '', shortNumber: p.short_number ?? '', email: p.email ?? '' }
    : { id: null, name: '', phone: '', shortNumber: '', email: '' };
}

async function save() {
  formError.value = '';
  try {
    const { id, ...body } = editing.value;
    if (id) await api.updatePerson(id, body);
    else await api.createPerson(body);
    editing.value = null;
    await load();
  } catch (e) {
    formError.value = e.message;
  }
}

async function remove(p) {
  if (!window.confirm(`确认删除「${p.name}」？`)) return;
  try {
    await api.deletePerson(p.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<style scoped>
.error { color: #c00; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; }
.dialog { background: #fff; padding: 20px; display: flex; flex-direction: column; gap: 10px; min-width: 320px; }
.dialog label { display: flex; justify-content: space-between; gap: 8px; }
</style>
```

- [ ] **Step 2: 手工验证**

Run: 后端 + 前端运行中，打开「人员配置」页。
Expected: 新增、编辑、删除人员均生效，刷新后数据仍在。

- [ ] **Step 3: Commit**

```bash
git add web/src/views/PersonsView.vue
git commit -m "feat: 人员配置页（增删改）"
```

---

### Task 11: 生产集成 + 端到端验证

**Files:**
- Modify: `需求简易文档.txt` 不动；根目录新增 `README.md`（启动说明）
- Create: `README.md`

- [ ] **Step 1: 构建前端并由后端托管**

Run:
```bash
cd web && npm run build && cd ../server && npm start
```
Expected: 控制台输出 `listening on http://localhost:3001`；浏览器访问 `http://localhost:3001` 打开应用（不再依赖 Vite dev server）。

- [ ] **Step 2: 用真实 Excel 走端到端验收（对应 spec 第 11 节成功标准）**

在 `http://localhost:3001` 手工执行并逐项确认：

1. 导入页选择项目根目录的《周报本周进展.xlsx》→ 周报时间自动填 2026-08-21 → 导入。
2. 预期结果：新增项目 ≈ 233，写入进展 ≈ 233（以实际文件为准）。
3. 周报列表页：默认显示 2026-08-21 的数据；分别用分类/工程责任人/项目阶段筛选，结果条数随之变化；切换周报时间下拉只有 2026-08-21。
4. 再次导入同一文件 → 弹出"已导入过"确认 → 确认后覆盖，统计中 updated ≈ 233。
5. 人员配置页新增/编辑/删除一条记录，刷新后保留。

数据库侧抽查（可选）：
```sql
SELECT COUNT(*) FROM weekly_report.projects;          -- ≈233
SELECT COUNT(*) FROM weekly_report.weekly_progress;   -- ≈233
```

- [ ] **Step 3: 写 README.md**

```markdown
# 工程周报管理网页应用

本地网页应用：导入《周报本周进展.xlsx》到 MySQL，网页筛选查看，支持每周增量导入与人员配置维护。

## 环境要求

- Node.js 18+
- 本机 MySQL（5.7+/8.x）

## 配置

复制 `server/.env.example` 为 `server/.env`，填入 MySQL 密码。

## 启动（生产模式）

```bash
cd web && npm install && npm run build
cd ../server && npm install && npm start
```

访问 http://localhost:3001 。首次启动自动建库 `weekly_report` 和三张表。

## 开发模式

```bash
cd server && npm start          # 后端 :3001
cd web && npm run dev           # 前端 Vite，/api 代理到 3001
```

## 测试

```bash
cd server && npm test           # 后端（使用 weekly_report_test 测试库）
cd web && npm test              # 前端
```
```

- [ ] **Step 4: 跑全量测试确认无回归**

Run: `cd server && npm test` 与 `cd web && npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add README.md web/dist 2>/dev/null || git add README.md
git commit -m "docs: README 启动与验收说明"
```

（`web/dist` 已被 .gitignore 忽略则只提交 README；dist 不入库，部署时本地构建。）

---

## Self-Review 记录

- **Spec 覆盖**：spec 第 4 节三张表 → Task 1；第 5 节 Excel 约定 → Task 2；第 6 节导入流程（表头日期、409 覆盖、统计）→ Task 3/4/9；第 7 节 API → Task 4/5/6；第 8 节三页面 → Task 8/9/10；第 9 节错误处理 → 各路由 try/catch + 400/409/500（Task 4/5/6）及 index.js 启动失败提示（Task 4 Step 3）；第 10 节测试 → 各任务 TDD + Task 11 全量回归；第 11 节成功标准 → Task 11 Step 2。
- **类型一致性**：`parseWeeklyReport` 返回字段（projectCode/categoryMajor/...）在 Task 2 测试与 Task 3 importData 消费处一致；`importData` 返回 `{inserted, updated, progressWritten}` 与 Task 4 响应及前端 `result.*` 渲染一致；人员字段 API body 用 `shortNumber`、行数据用 `short_number`，Task 6/7/10 三处一致。
