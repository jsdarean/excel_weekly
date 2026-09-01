import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import importRouter from './routes/import.js';
import importPmsRouter from './routes/importPms.js';
import reportsRouter from './routes/reports.js';
import personsRouter from './routes/persons.js';
import statsRouter from './routes/stats.js';
import projectsRouter from './routes/projects.js';
import watchedRouter from './routes/watched.js';
import contactsRouter from './routes/contacts.js';
import emailConfigRouter from './routes/emailConfig.js';
import bulkMailRouter from './routes/bulkMail.js';
import reportRouter from './routes/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/import', importRouter);
  app.use('/api/import-pms', importPmsRouter);
  app.use('/api', reportsRouter);
  app.use('/api/persons', personsRouter);
  app.use('/api', statsRouter);
  app.use('/api', projectsRouter);
  app.use('/api', watchedRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/email-config', emailConfigRouter);
  app.use('/api/bulk-mail', bulkMailRouter);
  app.use('/api', reportRouter);

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
