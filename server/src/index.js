import dotenv from 'dotenv';
import { initDatabase } from './db.js';
import { createApp } from './app.js';
import { warmupTransporter } from './mailService.js';

// 系统时区固定为北京时区，保证邮件 Date 头与展示时间为 +0800
process.env.TZ = 'Asia/Shanghai';

dotenv.config();
const PORT = Number(process.env.PORT) || 3001;

initDatabase()
  .then(() => {
    createApp().listen(PORT, () => {
      console.log(`listening on http://localhost:${PORT}`);
      // 后台预热 SMTP 连接池，用户首次发送无需等待握手
      warmupTransporter();
    });
  })
  .catch((e) => {
    console.error(`数据库初始化失败，请检查 server/.env 配置：${e.message}`);
    process.exit(1);
  });
