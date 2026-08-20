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
