import dotenv from 'dotenv';
import { initDatabase } from './db.js';
import { createApp } from './app.js';

dotenv.config();
const PORT = Number(process.env.PORT) || 3001;

initDatabase()
  .then(() => {
    createApp().listen(PORT, () => {
      console.log(`listening on http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error(`数据库初始化失败，请检查 server/.env 配置：${e.message}`);
    process.exit(1);
  });
