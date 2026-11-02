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
const OPTIONAL_COLS = ['第一次立项批复完成时间', '第一次立项批复金额', '总体进度计划-割接上线计划完成时间', '累计资本开支金额', '项目年份', '二级专业名称'];

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

function readRowsFromBuffer(fileBuffer, originalname) {
  let buf = fileBuffer;
  const isUploadedZip = String(originalname || '').toLowerCase().endsWith('.zip');
  if (isUploadedZip) {
    buf = extractXlsxFromZip(buf);
  }
  const wb = xlsx.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
}

function parseHeader(rows) {
  const header = (rows[0] || []).map((h) => String(h ?? '').trim());
  const idx = {};
  for (const name of REQUIRED_COLS) idx[name] = header.indexOf(name);
  for (const name of OPTIONAL_COLS) idx[name] = header.indexOf(name);
  const missing = REQUIRED_COLS.filter((n) => idx[n] === -1);
  if (missing.length) throw new Error(`Excel 缺少关键列：${missing.join('、')}`);
  return idx;
}

function parsePmsRows(rows, personNames) {
  const idx = parseHeader(rows);
  const parsed = [];
  for (const row of rows.slice(1)) {
    const code = row[idx['项目编码']] == null ? '' : String(row[idx['项目编码']]).trim();
    if (!code) continue;
    const manager = row[idx['工程管理经理-主']] == null ? '' : String(row[idx['工程管理经理-主']]).trim();
    if (!personNames.has(manager)) continue;
    const rawStage = row[idx['项目阶段']] == null ? '' : String(row[idx['项目阶段']]).trim();
    const stage = STAGE_MAP[rawStage];
    if (!stage) continue;
    parsed.push({
      projectCode: code,
      projectName: row[idx['项目名称']] == null ? '' : String(row[idx['项目名称']]).trim(),
      manager,
      stage,
      approvalDate: idx['第一次立项批复完成时间'] >= 0 ? parsePmsDate(row[idx['第一次立项批复完成时间']]) : null,
      budgetWan: idx['第一次立项批复金额'] >= 0 ? parsePmsMoney(row[idx['第一次立项批复金额']]) : null,
      planCutoverDate: idx['总体进度计划-割接上线计划完成时间'] >= 0 ? parsePmsDate(row[idx['总体进度计划-割接上线计划完成时间']]) : null,
      capexAmount: idx['累计资本开支金额'] >= 0 ? parsePmsMoney(row[idx['累计资本开支金额']]) : null,
      projectYear: idx['项目年份'] >= 0 ? String(row[idx['项目年份']] ?? '').trim() : '',
      categoryMajor: idx['二级专业名称'] >= 0 ? String(row[idx['二级专业名称']] ?? '').trim() : '',
    });
  }
  return parsed;
}

async function buildPreview(pool, rows) {
  const [personRows] = await pool.query('SELECT name FROM persons');
  const personNames = new Set(personRows.map((p) => p.name));
  const parsed = parsePmsRows(rows, personNames);

  const toInsert = [];
  const stageChanges = [];
  let unchanged = 0;
  let skippedOldYear = 0; // 新增过滤：项目年份早于 2026
  let skippedNoPerson = 0;
  let skippedStage = 0;

  // 统计跳过的行（需重新遍历原始行才能准确计数）
  const idx = parseHeader(rows);
  for (const row of rows.slice(1)) {
    const code = row[idx['项目编码']] == null ? '' : String(row[idx['项目编码']]).trim();
    if (!code) continue;
    const manager = row[idx['工程管理经理-主']] == null ? '' : String(row[idx['工程管理经理-主']]).trim();
    if (!personNames.has(manager)) {
      skippedNoPerson++;
      continue;
    }
    const rawStage = row[idx['项目阶段']] == null ? '' : String(row[idx['项目阶段']]).trim();
    if (!STAGE_MAP[rawStage]) {
      skippedStage++;
    }
  }

  for (const p of parsed) {
    const [existing] = await pool.query(
      'SELECT stage, approval_date, budget_wan, plan_cutover_date FROM projects WHERE project_code = ?',
      [p.projectCode]
    );
    if (!existing.length) {
      // 新增门槛：项目年份必须 2026 及以后（缺少年份视为不满足，不新增；存量项目不受此限制）
      const year = parseInt(p.projectYear, 10);
      if (!Number.isInteger(year) || year < 2026) {
        skippedOldYear++;
        continue;
      }
      toInsert.push(p);
      continue;
    }
    const hasStageChange = existing[0].stage !== p.stage;
    const hasFill =
      (p.approvalDate && !existing[0].approval_date) ||
      (p.budgetWan != null && existing[0].budget_wan == null) ||
      (p.planCutoverDate && !existing[0].plan_cutover_date);
    if (hasStageChange) {
      stageChanges.push({ ...p, from: existing[0].stage, to: p.stage, hasFill });
    } else if (hasFill) {
      // 仅有数据补充的，不按阶段变化处理，直接归类为可自动补充（后续 apply 仍会处理）
      stageChanges.push({ ...p, from: existing[0].stage, to: existing[0].stage, hasFill, onlyFill: true });
    } else {
      unchanged++;
    }
  }

  // 累计资本开支金额刷新清单：取自宽表全部数据行（不按负责人/阶段过滤，
  // apply 按 project_code 匹配库内项目，未知编码的更新影响 0 行、无副作用）
  const moneyRows = [];
  const seen = new Set();
  const idx2 = parseHeader(rows);
  for (const row of rows.slice(1)) {
    const code = row[idx2['项目编码']] == null ? '' : String(row[idx2['项目编码']]).trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    moneyRows.push({
      projectCode: code,
      capexAmount: idx2['累计资本开支金额'] >= 0 ? parsePmsMoney(row[idx2['累计资本开支金额']]) : null,
    });
  }
  return { toInsert, stageChanges, unchanged, skippedNoPerson, skippedStage, skippedOldYear, moneyRows };
}

async function applyChanges(pool, toInsert, confirmedUpdates, moneyRows = []) {
  const updatedList = [];
  const insertedList = [];
  let moneyUpdated = 0;
  // 累计资本开支金额：以宽表为准全量覆盖（与阶段/批复字段的"只补空"不同；转资金额由转资工单导入维护）
  for (const m of moneyRows) {
    const sets = [];
    const params = [];
    if (m.capexAmount != null) { sets.push('capex_amount = ?'); params.push(m.capexAmount); }
    if (!sets.length) continue;
    const [r] = await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE project_code = ?`, [...params, m.projectCode]);
    if (r.affectedRows > 0) moneyUpdated++;
  }

  for (const p of toInsert) {
    await pool.query(
      'INSERT INTO projects (project_code, project_name, stage, owner, approval_date, budget_wan, plan_cutover_date, capex_amount, category_major) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.projectCode, p.projectName, p.stage, p.manager, p.approvalDate, p.budgetWan, p.planCutoverDate, p.capexAmount, p.categoryMajor || null]
    );
    insertedList.push({ projectCode: p.projectCode, projectName: p.projectName, manager: p.manager });
  }

  for (const p of confirmedUpdates) {
    const [existing] = await pool.query(
      'SELECT stage, approval_date, budget_wan, plan_cutover_date FROM projects WHERE project_code = ?',
      [p.projectCode]
    );
    if (!existing.length) continue;
    const updates = [];
    const params = [];
    if (existing[0].stage !== p.stage) {
      updates.push('stage = ?');
      params.push(p.stage);
      // 记录阶段变更时间，支撑"近N周交付项目数"统计
      updates.push('stage_changed_at = NOW()');
    }
    if (p.approvalDate && !existing[0].approval_date) {
      updates.push('approval_date = ?');
      params.push(p.approvalDate);
    }
    if (p.budgetWan != null && existing[0].budget_wan == null) {
      updates.push('budget_wan = ?');
      params.push(p.budgetWan);
    }
    // 计划割接上线时间：仅库中为空时补充，已有值不覆盖
    if (p.planCutoverDate && !existing[0].plan_cutover_date) {
      updates.push('plan_cutover_date = ?');
      params.push(p.planCutoverDate);
    }
    // 累计资本开支金额：每次导入都覆盖更新（宽表为准）
    if (p.capexAmount != null) {
      updates.push('capex_amount = ?');
      params.push(p.capexAmount);
    }
    if (updates.length) {
      await pool.query(`UPDATE projects SET ${updates.join(', ')} WHERE project_code = ?`, [...params, p.projectCode]);
      if (existing[0].stage !== p.stage) {
        updatedList.push({ projectCode: p.projectCode, projectName: p.projectName, manager: p.manager, from: existing[0].stage, to: p.stage });
      }
    }
  }

  return { updatedList, insertedList, moneyUpdated };
}

router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });

    let rows;
    try {
      rows = readRowsFromBuffer(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: e.message.includes('ZIP') ? e.message : 'Excel 解析失败，请确认文件格式' });
    }

    const pool = getPool();
    const preview = await buildPreview(pool, rows);
    res.json(preview);
  } catch (e) {
    if (e.message && e.message.includes('Excel 缺少关键列')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: `预览失败：${e.message}` });
  }
});

router.post('/apply', async (req, res) => {
  try {
    const { toInsert = [], confirmedUpdates = [], moneyRows = [] } = req.body || {};
    const pool = getPool();
    const { updatedList, insertedList, moneyUpdated } = await applyChanges(pool, toInsert, confirmedUpdates, moneyRows);
    res.json({ updated: updatedList.length, inserted: insertedList.length, moneyUpdated, updatedList, insertedList });
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

// 保留旧的一键导入接口，供非交互场景使用
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });

    let rows;
    try {
      rows = readRowsFromBuffer(req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ error: e.message.includes('ZIP') ? e.message : 'Excel 解析失败，请确认文件格式' });
    }

    const pool = getPool();
    const [personRows] = await pool.query('SELECT name FROM persons');
    const personNames = new Set(personRows.map((p) => p.name));
    const parsed = parsePmsRows(rows, personNames);

    const stats = {
      updated: 0,
      inserted: 0,
      unchanged: 0,
      skippedNoPerson: 0,
      skippedStage: 0,
      updatedList: [],
      insertedList: [],
    };

    // 跳过统计
    const idx = parseHeader(rows);
    for (const row of rows.slice(1)) {
      const code = row[idx['项目编码']] == null ? '' : String(row[idx['项目编码']]).trim();
      if (!code) continue;
      const manager = row[idx['工程管理经理-主']] == null ? '' : String(row[idx['工程管理经理-主']]).trim();
      if (!personNames.has(manager)) {
        stats.skippedNoPerson++;
        continue;
      }
      const rawStage = row[idx['项目阶段']] == null ? '' : String(row[idx['项目阶段']]).trim();
      if (!STAGE_MAP[rawStage]) stats.skippedStage++;
    }

    for (const p of parsed) {
      const [existing] = await pool.query(
        'SELECT stage, approval_date, budget_wan, plan_cutover_date FROM projects WHERE project_code = ?',
        [p.projectCode]
      );
      if (existing.length) {
        const updates = [];
        const params = [];
        if (existing[0].stage !== p.stage) {
          updates.push('stage = ?');
          params.push(p.stage);
          // 记录阶段变更时间，支撑"近N周交付项目数"统计
          updates.push('stage_changed_at = NOW()');
        }
        if (p.approvalDate && !existing[0].approval_date) {
          updates.push('approval_date = ?');
          params.push(p.approvalDate);
        }
        if (p.budgetWan != null && existing[0].budget_wan == null) {
          updates.push('budget_wan = ?');
          params.push(p.budgetWan);
        }
        // 计划割接上线时间：仅库中为空时补充，已有值不覆盖
        if (p.planCutoverDate && !existing[0].plan_cutover_date) {
          updates.push('plan_cutover_date = ?');
          params.push(p.planCutoverDate);
        }
        // 累计资本开支金额：每次导入都覆盖更新（宽表为准）
        if (p.capexAmount != null) {
          updates.push('capex_amount = ?');
          params.push(p.capexAmount);
        }
        if (updates.length) {
          await pool.query(`UPDATE projects SET ${updates.join(', ')} WHERE project_code = ?`, [...params, p.projectCode]);
          if (existing[0].stage !== p.stage) {
            stats.updatedList.push({ projectCode: p.projectCode, projectName: p.projectName, manager: p.manager, from: existing[0].stage, to: p.stage });
          }
          stats.updated++;
        } else {
          stats.unchanged++;
        }
      } else {
        await pool.query(
          'INSERT INTO projects (project_code, project_name, stage, owner, approval_date, budget_wan, plan_cutover_date, capex_amount, category_major) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.projectCode, p.projectName, p.stage, p.manager, p.approvalDate, p.budgetWan, p.planCutoverDate, p.capexAmount, p.categoryMajor || null]
        );
        stats.inserted++;
        stats.insertedList.push({ projectCode: p.projectCode, projectName: p.projectName, manager: p.manager });
      }
    }

    res.json(stats);
  } catch (e) {
    if (e.message && e.message.includes('Excel 缺少关键列')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
