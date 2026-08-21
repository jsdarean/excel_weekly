import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { getPool } from '../db.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

// 宽表阶段 → 库内标准阶段
const STAGE_MAP = {
  工程实施阶段: '项目实施阶段',
  审计归档阶段: '终验归档阶段',
  勘察设计阶段: '勘察设计阶段',
  项目实施阶段: '项目实施阶段',
  工程验收阶段: '工程验收阶段',
  终验归档阶段: '终验归档阶段',
};

const REQUIRED_COLS = ['项目编码', '项目名称', '项目阶段', '工程管理经理-主'];

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });

    let rows;
    try {
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    } catch {
      return res.status(400).json({ error: 'Excel 解析失败，请确认文件格式' });
    }
    const header = (rows[0] || []).map((h) => String(h ?? '').trim());
    const idx = {};
    for (const name of REQUIRED_COLS) idx[name] = header.indexOf(name);
    const missing = REQUIRED_COLS.filter((n) => idx[n] === -1);
    if (missing.length) {
      return res.status(400).json({ error: `Excel 缺少关键列：${missing.join('、')}` });
    }

    const pool = getPool();
    // 人员配置里的姓名集合
    const [persons] = await pool.query('SELECT name FROM persons');
    const personNames = new Set(persons.map((p) => p.name));

    const stats = {
      updated: 0,
      inserted: 0,
      unchanged: 0,
      skippedNoPerson: 0,
      skippedStage: 0,
      updatedList: [],
      insertedList: [],
    };

    for (const row of rows.slice(1)) {
      const code = row[idx['项目编码']] == null ? '' : String(row[idx['项目编码']]).trim();
      if (!code) continue;
      const manager = row[idx['工程管理经理-主']] == null ? '' : String(row[idx['工程管理经理-主']]).trim();
      // 只关注人员配置里的人
      if (!personNames.has(manager)) {
        stats.skippedNoPerson++;
        continue;
      }
      const rawStage = row[idx['项目阶段']] == null ? '' : String(row[idx['项目阶段']]).trim();
      const stage = STAGE_MAP[rawStage];
      // 映射后不属于 4 个标准阶段的（如立项阶段）：不管
      if (!stage) {
        stats.skippedStage++;
        continue;
      }
      const name = row[idx['项目名称']] == null ? '' : String(row[idx['项目名称']]).trim();

      const [existing] = await pool.query(
        'SELECT stage FROM projects WHERE project_code = ?',
        [code]
      );
      if (existing.length) {
        if (existing[0].stage !== stage) {
          await pool.query('UPDATE projects SET stage = ? WHERE project_code = ?', [stage, code]);
          stats.updated++;
          stats.updatedList.push({ projectCode: code, from: existing[0].stage, to: stage });
        } else {
          stats.unchanged++;
        }
      } else {
        await pool.query(
          'INSERT INTO projects (project_code, project_name, stage, owner) VALUES (?, ?, ?, ?)',
          [code, name, stage, manager]
        );
        stats.inserted++;
        stats.insertedList.push(code);
      }
    }

    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
