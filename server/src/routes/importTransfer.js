import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { getPool } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const REQUIRED_COLS = ['项目编码', '转资合计金额', '审批状态', '导入状态'];

// 转资工单导入：按项目编码汇总「转资合计金额」写入 projects.transferred_amount（万元）
// 只统计：审批状态=审批通过 且 导入状态=成功 的行；同一项目多行求和；以本表为权威来源，全量覆盖
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });
    let aoa;
    try {
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      aoa = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    } catch (e) {
      return res.status(400).json({ error: `Excel 解析失败：${e.message}` });
    }
    if (!aoa.length) return res.status(400).json({ error: 'Excel 内容为空' });

    const header = (aoa[0] || []).map((h) => String(h ?? '').trim());
    const idx = {};
    for (const name of REQUIRED_COLS) idx[name] = header.indexOf(name);
    const missing = REQUIRED_COLS.filter((n) => idx[n] === -1);
    if (missing.length) {
      return res.status(400).json({ error: `Excel 缺少关键列：${missing.join('、')}` });
    }

    // 汇总（元 → 万元），仅 审批通过 + 成功
    const sumMap = new Map(); // code → 万元
    let countedRows = 0;
    for (const row of aoa.slice(1)) {
      const code = String(row[idx['项目编码']] ?? '').trim();
      if (!code) continue;
      const approval = String(row[idx['审批状态']] ?? '').trim();
      const importStatus = String(row[idx['导入状态']] ?? '').trim();
      if (approval !== '审批通过' || importStatus !== '成功') continue;
      const yuan = Number(String(row[idx['转资合计金额']] ?? '').replace(/,/g, '').trim());
      if (!Number.isFinite(yuan)) continue;
      sumMap.set(code, (sumMap.get(code) || 0) + yuan / 10000);
      countedRows++;
    }

    const pool = getPool();
    let updated = 0;
    const unmatched = [];
    for (const [code, wan] of sumMap) {
      const [r] = await pool.query(
        'UPDATE projects SET transferred_amount = ? WHERE project_code = ?',
        [Math.round(wan * 100) / 100, code]
      );
      if (r.affectedRows > 0) updated++;
      else unmatched.push(code);
    }

    res.json({
      updated,
      countedRows,
      projectsInFile: sumMap.size,
      unmatched: unmatched.length,
      unmatchedList: unmatched.slice(0, 20),
    });
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
