import { Router } from 'express';
import { getPool } from '../db.js';
import { buildReportData, renderTemplate } from '../reportService.js';

const router = Router();
const MAX_TEMPLATES = 5;
// 模板列表
router.get('/report-templates', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, name, content, with_attachment, mail_title, mail_subtitle, mail_subject, mail_signature, subject_with_date, subtitle_date_mode, subject_date_mode, highlights_weeks FROM report_templates ORDER BY id'
    );
    res.json({ templates: rows });
  } catch (e) {
    res.status(500).json({ error: `读取失败：${e.message}` });
  }
});

// 新建模板（最多 5 个）
router.post('/report-templates', async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: '模板名称不能为空' });
    const content = String(req.body?.content ?? '');
    const withAttachment = req.body?.withAttachment ? 1 : 0;
    const mailTitle = String(req.body?.mailTitle ?? '').trim() || null;
    const mailSubtitle = String(req.body?.mailSubtitle ?? '').trim() || null;
    const mailSubject = String(req.body?.mailSubject ?? '').trim() || null;
    const mailSignature = String(req.body?.mailSignature ?? '') || null;
    const subjectWithDate = req.body?.subjectWithDate === false ? 0 : 1;
    const subtitleDateMode = ['none', 'day', 'week', 'biweek'].includes(req.body?.subtitleDateMode)
      ? req.body.subtitleDateMode : 'none';
    const subjectDateMode = ['none', 'day', 'week', 'biweek'].includes(req.body?.subjectDateMode)
      ? req.body.subjectDateMode : 'day';
    const highlightsWeeks = [1, 2, 4].includes(Number(req.body?.highlightsWeeks)) ? Number(req.body.highlightsWeeks) : 1;
    const pool = getPool();
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM report_templates');
    if (n >= MAX_TEMPLATES) {
      return res.status(400).json({ error: `最多只能保存 ${MAX_TEMPLATES} 个模板` });
    }
    const [r] = await pool.query(
      `INSERT INTO report_templates (name, content, with_attachment, mail_title, mail_subtitle, mail_subject, mail_signature, subject_with_date, subtitle_date_mode, subject_date_mode, highlights_weeks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, content, withAttachment, mailTitle, mailSubtitle, mailSubject, mailSignature, subjectWithDate, subtitleDateMode, subjectDateMode, highlightsWeeks]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 改名 / 改内容 / 改周期类型
router.put('/report-templates/:id', async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: '模板名称不能为空' });
    const content = String(req.body?.content ?? '');
    const withAttachment = req.body?.withAttachment ? 1 : 0;
    const mailTitle = String(req.body?.mailTitle ?? '').trim() || null;
    const mailSubtitle = String(req.body?.mailSubtitle ?? '').trim() || null;
    const mailSubject = String(req.body?.mailSubject ?? '').trim() || null;
    const mailSignature = String(req.body?.mailSignature ?? '') || null;
    const subjectWithDate = req.body?.subjectWithDate === false ? 0 : 1;
    const subtitleDateMode = ['none', 'day', 'week', 'biweek'].includes(req.body?.subtitleDateMode)
      ? req.body.subtitleDateMode : 'none';
    const subjectDateMode = ['none', 'day', 'week', 'biweek'].includes(req.body?.subjectDateMode)
      ? req.body.subjectDateMode : 'day';
    const highlightsWeeks = [1, 2, 4].includes(Number(req.body?.highlightsWeeks)) ? Number(req.body.highlightsWeeks) : 1;
    const [r] = await getPool().query(
      `UPDATE report_templates SET name = ?, content = ?, with_attachment = ?,
         mail_title = ?, mail_subtitle = ?, mail_subject = ?, mail_signature = ?, subject_with_date = ?,
         subtitle_date_mode = ?, subject_date_mode = ?, highlights_weeks = ? WHERE id = ?`,
      [name, content, withAttachment, mailTitle, mailSubtitle, mailSubject, mailSignature, subjectWithDate, subtitleDateMode, subjectDateMode, highlightsWeeks, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: '模板不存在' });
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 删除模板
router.delete('/report-templates/:id', async (req, res) => {
  try {
    const [r] = await getPool().query('DELETE FROM report_templates WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '模板不存在' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: `删除失败：${e.message}` });
  }
});

// 按模板生成预览（不带 template_id 时用第一个模板）
router.get('/report-preview', async (req, res) => {
  try {
    const pool = getPool();
    let rows;
    if (req.query.template_id) {
      [rows] = await pool.query(
        'SELECT content, with_attachment, highlights_weeks FROM report_templates WHERE id = ?',
        [req.query.template_id]
      );
      if (!rows.length) return res.status(404).json({ error: '模板不存在' });
    } else {
      [rows] = await pool.query('SELECT content, with_attachment, highlights_weeks FROM report_templates ORDER BY id LIMIT 1');
    }
    const template = rows.length ? rows[0].content ?? '' : '';
    if (!template) return res.json({ text: '' });
    const data = await buildReportData(pool, { highlightsWeeks: rows[0].highlights_weeks });
    res.json({ text: renderTemplate(template, data) });
  } catch (e) {
    res.status(500).json({ error: `生成失败：${e.message}` });
  }
});

export default router;
