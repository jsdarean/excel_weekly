# 工程周报管理网页应用 — 设计文档（Spec）

日期：2026-08-20
状态：待评审

## 1. 背景与目标

将《周报本周进展.xlsx》中的工程周报数据导入本机 MySQL，通过本地网页应用进行合并展示与筛选，支持每周增量导入进展，并提供工程责任人联系信息（人员配置）的维护功能。

需求来源：`需求简易文档.txt`。

## 2. 范围

**包含：**
- Excel 全量导入（基础数据 upsert + 当周进展 upsert）
- 合并数据的网页展示与 4 条件筛选（周报时间、分类、工程责任人、项目阶段）
- 人员配置（姓名、电话、短号、邮箱）的增删改查

**不包含（YAGNI）：**
- 登录鉴权（单机单人使用）
- 工程责任人与人员表的关联（人员表独立维护）
- 数据导出、图表统计、多用户、权限
- Excel 中 Sheet1/Sheet2 两个透视统计 sheet 的导入（只导入第一个工作表）

## 3. 技术栈与架构

- **后端**：Node.js + Express，REST API，端口 **3001**；生产模式托管前端构建产物 `web/dist`（单进程单端口）。
- **前端**：Vue3 + Vite SPA（`web/`），开发时 Vite 热更新并将 `/api` 代理到 3001。
- **数据库**：本机 MySQL，库名 `weekly_report`。驱动用 `mysql2`（promise 池），手写 SQL，不引入 ORM。
- **Excel 解析**：SheetJS（`xlsx` 包）。
- **配置**：`server/.env` 存 MySQL 连接（`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`），提供 `.env.example`。首次启动自动 `CREATE DATABASE IF NOT EXISTS` 并建表。

### 目录结构

```
excel_weekly/
├── server/           # Express 后端
│   ├── src/
│   │   ├── index.js        # 入口：建库建表、启动服务
│   │   ├── db.js           # mysql2 连接池 + 建表
│   │   ├── routes/         # projects / progress / persons / import
│   │   └── excel.js        # Excel 解析（B-J / L-Q 列映射）
│   └── package.json
├── web/              # Vue3 + Vite 前端
│   ├── src/
│   │   ├── views/          # 周报列表 / 导入 / 人员配置
│   │   └── api.js          # fetch 封装
│   └── package.json
└── docs/superpowers/specs/2026-08-20-weekly-report-app-design.md
```

## 4. 数据模型（库 `weekly_report`）

### 4.1 `projects` — 基础数据表（对应 Excel B–J 列）

| 列 | 类型 | 说明 |
|---|---|---|
| id | INT AUTO_INCREMENT PK | |
| project_code | VARCHAR(64) NOT NULL UNIQUE | 项目编码（C 列），匹配键 |
| category_major | VARCHAR(64) | 专业类别（B 列） |
| project_name | VARCHAR(255) | 项目名称（D 列） |
| approval_date | DATE NULL | 立项批复日期（E 列） |
| category | VARCHAR(64) | 分类（F 列），筛选项 |
| owner | VARCHAR(64) | 工程责任人（G 列），筛选项 |
| budget_wan | DECIMAL(12,2) NULL | 立项金额（万元）（H 列） |
| stage | VARCHAR(64) | 项目阶段（I 列），筛选项 |
| content | TEXT | 建设内容（J 列） |
| created_at / updated_at | DATETIME | |

### 4.2 `weekly_progress` — 周进展表（对应 Excel L–Q 列 + 选定时间）

| 列 | 类型 | 说明 |
|---|---|---|
| id | INT AUTO_INCREMENT PK | |
| project_code | VARCHAR(64) NOT NULL | 关联 projects.project_code |
| report_date | DATE NOT NULL | 周报时间（导入时选定，筛选项） |
| progress | TEXT | 周进展（L 列） |
| purchase_rate | DECIMAL(5,2) NULL | 主设备请购完成率（M 列，如 0.85） |
| disclosure | VARCHAR(8) | 是否交底（N 列，是/否） |
| arrival_rate | DECIMAL(5,2) NULL | 主设备到货完成率（O 列） |
| online_handover | VARCHAR(8) | 是否上线交维（P 列） |
| final_acceptance | VARCHAR(8) | 是否竣工验收（Q 列） |
| created_at / updated_at | DATETIME | |

唯一键：`UNIQUE(project_code, report_date)`。

### 4.3 `persons` — 人员表

| 列 | 类型 | 说明 |
|---|---|---|
| id | INT AUTO_INCREMENT PK | |
| name | VARCHAR(64) NOT NULL | 姓名 |
| phone | VARCHAR(32) | 电话 |
| short_number | VARCHAR(16) | 短号 |
| email | VARCHAR(128) | 邮箱 |
| created_at / updated_at | DATETIME | |

## 5. Excel 结构约定

以《周报本周进展.xlsx》第一个工作表为准（当前为"按类别区分 2026年8月"，233 条数据）：

- 第 1 行表头；A 列"序号"忽略。
- B–J：基础数据；K：上周进展（**不导入**，库里按周存历史自然可查）；L：本周进展，表头含日期如"周进展（20260821）"；M–Q：本周其他进展列。
- 以 C 列项目编码为匹配键；编码为空的行跳过并计入导入结果的"跳过数"。

## 6. 导入流程

1. 前端选择 Excel 文件并上传（`multipart/form-data`）；尝试从 L 列表头解析 `yyyymmdd` 预填周报时间，用户可修改（日期选择器）。
2. 后端解析后先校验：该 `report_date` 在 `weekly_progress` 中是否已有记录。
   - 有 → 返回 `409` + 提示"本周已导入过，再次导入会覆盖"，前端弹确认框，用户确认后带 `overwrite=true` 重发。
   - 无 → 直接导入。
3. 导入（一个事务内）：
   - B–J 列 upsert `projects`（按 `project_code`：不存在则插入，存在则更新 B–J 全部字段）。
   - L–Q 列 + `report_date` upsert `weekly_progress`（覆盖该周记录）。
4. 返回统计：`{ inserted, updated, progressWritten, skipped }`，前端展示。

## 7. API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/reports?report_date=&category=&owner=&stage=` | 合并查询：projects JOIN 指定周的 weekly_progress；筛选参数均可选；`report_date` 缺省取最新一周 |
| GET | `/api/report-dates` | 返回所有 distinct 周报时间（降序），用于筛选下拉 |
| GET | `/api/filters` | 返回分类/工程责任人/项目阶段的 distinct 选项 |
| POST | `/api/import?overwrite=false` | 上传 Excel 导入（字段 `file`、`report_date`）；冲突返回 409 |
| GET/POST/PUT/DELETE | `/api/persons[/:id]` | 人员增删改查 |

统一错误格式：`{ error: "message" }`，HTTP 状态码表意（400 参数错误 / 409 冲突 / 500 服务器错误）。

## 8. 前端页面

1. **周报列表页**（默认页）：顶部 4 个筛选下拉（周报时间默认最新一周，其余默认"全部"），下方表格展示合并数据（基础数据列 + 当周进展列）。
2. **导入页**：文件选择、周报时间选择（自动预填）、导入按钮、覆盖确认弹窗、导入结果统计展示。
3. **人员配置页**：人员列表表格 + 新增按钮 + 行内编辑/删除，弹窗表单（姓名必填，其余可选）。

导航：顶部三个标签页路由（vue-router）。

## 9. 错误处理

- Excel 文件缺失/格式不符（缺关键列表头）→ 400，提示具体缺失列。
- `report_date` 非法 → 400。
- 数据库连接失败 → 启动时报错退出并打印连接配置提示。
- 导入事务失败 → 整体回滚，返回 500 + 错误信息。

## 10. 测试

- 后端：Vitest + 内存级单元测试覆盖 Excel 列映射解析（`excel.js`）和导入 upsert/覆盖判断逻辑；导入测试用 fixture Excel（取真实表前几行构造）。
- 前端：关键组件（筛选参数拼接、覆盖确认交互）做轻量测试，页面整体以手工验证为主。
- 验证方式：`npm test`（server）、启动后用真实 Excel 走一遍导入 → 筛选 → 人员增删改流程。

## 11. 成功标准

- 启动后端后访问 `http://localhost:3001` 可用。
- 导入《周报本周进展.xlsx》后：projects 约 233 条，weekly_progress 当周约 233 条。
- 4 个筛选条件可组合过滤且结果正确。
- 同一 `report_date` 重复导入时先提示、确认后覆盖。
- 人员配置可增删改并持久化。
