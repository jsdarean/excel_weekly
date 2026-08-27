# 威联通 NAS 部署指南

项目由前端（Nginx 静态资源）、后端（Node.js + Express）、MariaDB 三部分组成。推荐在 NAS 的 **Container Station** 中运行前后端容器，MariaDB 复用 NAS 上已有的数据库。

## 一、NAS 环境准备

1. **开启 MariaDB** 并确认已启用 TCP 连接（默认端口 3306）。
2. **创建数据库**：
   ```sql
   CREATE DATABASE IF NOT EXISTS weekly_report DEFAULT CHARSET utf8mb4;
   ```
3. 建议为项目单独创建一个数据库用户并授权（也可直接用 root）。

## 二、将代码放到 NAS

在本地或 NAS 上执行：

```bash
git clone https://github.com/jsdarean/excel_weekly.git
cd excel_weekly
```

## 三、构建前端

**方式 A：在本地电脑构建后上传（推荐）**

```bash
cd web
npm install
npm run build
```

构建完成后，将 `web/dist` 目录上传到 NAS 的项目根目录下。

**方式 B：在 NAS 上安装 Node.js 后直接构建**

若 NAS 已安装 Node.js 20+，在项目目录执行：

```bash
cd web && npm install && npm run build
```

## 四、配置环境变量

在项目根目录创建 `.env` 文件：

```bash
DB_HOST=192.168.x.x          # NAS 的局域网 IP，不要用 localhost
DB_PORT=3306
DB_USER=root                 # 或你创建的数据库用户
DB_PASSWORD=你的数据库密码
DB_NAME=weekly_report
```

> **注意**：容器内访问宿主机的 `localhost` 不可行，务必填写 NAS 的局域网 IP。如果 NAS 的 MariaDB 只监听 127.0.0.1，请在 MariaDB 配置中绑定 `0.0.0.0` 或 NAS 局域网 IP。

## 五、Container Station 部署

打开 NAS 的 Container Station，进入项目所在目录，执行：

```bash
docker-compose up -d
```

容器说明：

| 容器 | 镜像来源 | 内部端口 | NAS 映射端口 | 说明 |
|------|----------|----------|--------------|------|
| weekly-report-backend | Dockerfile.backend | 3001 | 3001 | Node.js 后端 API |
| weekly-report-frontend | Dockerfile.frontend | 80 | 8080 | Nginx 前端 + 反向代理 |

## 六、访问与域名

默认通过：

```
http://zyaiql.asia:8080
```

如果希望直接使用 `http://zyaiql.asia/`（不加 8080 端口），有以下两种方案：

### 方案 1：修改 docker-compose 端口映射

把 `frontend` 的端口映射从 `8080:80` 改为 `80:80`：

```yaml
ports:
  - "80:80"
```

**前提**：NAS 的 80 端口没有被自带 Web 服务占用。

### 方案 2：使用 NAS 自带 Web 服务 / 反向代理

保留容器端口 `8080:80`，在 NAS 的 Web 服务或 Nginx 中配置反向代理：

```nginx
server {
    listen 80;
    server_name zyaiql.asia;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

威联通一般在 **Web 服务器** 或 **反向代理** 设置中可完成此配置。

## 七、更新升级

更新代码后重新构建前端并重启容器：

```bash
git pull
cd web && npm install && npm run build
cd ..
docker-compose down
docker-compose up -d --build
```

## 八、常见问题

1. **后端启动报错 `ECONNREFUSED 192.168.x.x:3306`**
   - 检查 MariaDB 是否允许外部/容器访问。
   - 检查 `.env` 中的 `DB_HOST` 是否为 NAS 局域网 IP。

2. **前端页面空白或 404**
   - 确认 `web/dist` 目录存在且包含 `index.html`。
   - 确认构建时无报错。

3. **端口冲突**
   - 若 8080 被占用，修改 `docker-compose.yml` 中的前端端口映射，例如 `8090:80`。
