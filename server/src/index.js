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
