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
