import { Router } from 'express';
import multer from 'multer';
import { getPool } from '../db.js';
import { parseWeeklyReport } from '../excel.js';
import { hasProgressForDate, importData } from '../importService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });
    let parsed;
    try {
      parsed = parseWeeklyReport(req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'Excel 解析失败，请确认文件格式' });
    }
    const reportDate = req.body.report_date || parsed.headerDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate || '')) {
      return res
        .status(400)
        .json({ error: '周报时间缺失或格式非法（需 YYYY-MM-DD）' });
    }
    const overwrite = req.body.overwrite === 'true';
    if (!overwrite && (await hasProgressForDate(getPool(), reportDate))) {
      return res.status(409).json({
        error: `周报时间 ${reportDate} 已导入过，再次导入将覆盖该周数据`,
        conflict: true,
      });
    }
    const stats = await importData(getPool(), parsed, reportDate);
    res.json({ reportDate, ...stats, skipped: parsed.skipped });
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
