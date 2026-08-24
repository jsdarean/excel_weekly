import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import AdmZip from 'adm-zip';
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
const OPTIONAL_COLS = ['第一次立项批复完成时间', '第一次立项批复金额'];

function extractXlsxFromZip(buf) {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  const entry = entries.find((e) => e.entryName.toLowerCase().endsWith('.xlsx'));
  if (!entry) throw new Error('ZIP 压缩包中未找到 .xlsx 文件');
  return entry.getData();
}

function parsePmsDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const parsed = xlsx.SSF.parse_date_code(v);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    return null;
  }
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[\/\-年月](\d{1,2})[\/\-月日](\d{1,2})日?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }
  return null;
}

function parsePmsMoney(v) {
  if (v == null || v === '') return null;
  const num = Number(String(v).replace(/,/g, '').trim());
  if (Number.isNaN(num)) return null;
  return num / 10000;
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });

    let fileBuffer = req.file.buffer;
    const isUploadedZip = String(req.file.originalname || '').toLowerCase().endsWith('.zip');
    if (isUploadedZip) {
      try {
        fileBuffer = extractXlsxFromZip(fileBuffer);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    let rows;
    try {
      const wb = xlsx.read(fileBuffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    } catch {
      return res.status(400).json({ error: 'Excel 解析失败，请确认文件格式' });
    }
    const header = (rows[0] || []).map((h) => String(h ?? '').trim());
    const idx = {};
    for (const name of REQUIRED_COLS) idx[name] = header.indexOf(name);
    for (const name of OPTIONAL_COLS) idx[name] = header.indexOf(name);
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
    // 记录项目编码 → 名称/经理，用于返回明细
    const projectMeta = new Map();

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
      const approvalDate = idx['第一次立项批复完成时间'] >= 0 ? parsePmsDate(row[idx['第一次立项批复完成时间']]) : null;
      const budgetWan = idx['第一次立项批复金额'] >= 0 ? parsePmsMoney(row[idx['第一次立项批复金额']]) : null;
      projectMeta.set(code, { projectName: name, manager });

      const [existing] = await pool.query(
        'SELECT stage, approval_date, budget_wan FROM projects WHERE project_code = ?',
        [code]
      );
      if (existing.length) {
        const updates = [];
        const params = [];
        if (existing[0].stage !== stage) {
          updates.push('stage = ?');
          params.push(stage);
        }
        if (approvalDate && !existing[0].approval_date) {
          updates.push('approval_date = ?');
          params.push(approvalDate);
        }
        if (budgetWan != null && existing[0].budget_wan == null) {
          updates.push('budget_wan = ?');
          params.push(budgetWan);
        }
        if (updates.length) {
          await pool.query(`UPDATE projects SET ${updates.join(', ')} WHERE project_code = ?`, [...params, code]);
          if (existing[0].stage !== stage) {
            stats.updatedList.push({ projectCode: code, projectName: name, manager, from: existing[0].stage, to: stage });
          }
          stats.updated++;
        } else {
          stats.unchanged++;
        }
      } else {
        await pool.query(
          'INSERT INTO projects (project_code, project_name, stage, owner, approval_date, budget_wan) VALUES (?, ?, ?, ?, ?, ?)',
          [code, name, stage, manager, approvalDate, budgetWan]
        );
        stats.inserted++;
        stats.insertedList.push({ projectCode: code, projectName: name, manager });
      }
    }

    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
