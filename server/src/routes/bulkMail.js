import { Router } from 'express';
import { getPool } from '../db.js';
import {
  getTemplate, saveTemplate, listMailProjects, renderProjectMail,
} from '../bulkMailService.js';
import { getEmailConfig, configComplete, sendAndArchive } from '../mailService.js';

const router = Router();

// 读取邮件模板（未保存过返回默认模板）
router.get('/template', async (req, res) => {
  try {
    res.json({ template: await getTemplate() });
  } catch (e) {
    res.status(500).json({ error: `读取失败：${e.message}` });
  }
});

// 保存邮件模板
router.put('/template', async (req, res) => {
  try {
    const b = req.body ?? {};
    const subject = String(b.subject ?? '').trim();
    const body = String(b.body ?? '').trim();
    const signature = String(b.signature ?? '').trim();
    if (!subject) return res.status(400).json({ error: '邮件主题不能为空' });
    if (!body) return res.status(400).json({ error: '邮件正文不能为空' });
    await saveTemplate({ subject, body, signature });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 通用抄送人列表
router.get('/cc-list', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, name, email, enabled, sort_order FROM mail_cc_list ORDER BY sort_order, id'
    );
    res.json({ list: rows });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 整体保存通用抄送人（录入/修改/删除/调序一次提交，数组顺序即显示顺序）
router.put('/cc-list', async (req, res) => {
  try {
    const list = req.body?.list;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'list 必须是数组' });
    const seen = new Set();
    const rows = [];
    for (let i = 0; i < list.length; i++) {
      const name = String(list[i]?.name ?? '').trim();
      const email = String(list[i]?.email ?? '').trim();
      if (!name) return res.status(400).json({ error: `第 ${i + 1} 行：姓名不能为空` });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: `第 ${i + 1} 行：邮箱格式不正确` });
      if (seen.has(email)) return res.status(400).json({ error: `邮箱重复：${email}` });
      seen.add(email);
      rows.push([name, email, list[i].enabled ? 1 : 0, i + 1]);
    }
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM mail_cc_list');
      for (const r of rows) {
        await conn.query(
          'INSERT INTO mail_cc_list (name, email, enabled, sort_order) VALUES (?, ?, ?, ?)',
          r
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 可发送项目列表（有勾选收件人的项目）
router.get('/projects', async (req, res) => {
  try {
    res.json({ projects: await listMailProjects(getPool()) });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

// 预览某项目的完整邮件
router.get('/preview/:code', async (req, res) => {
  try {
    const mail = await renderProjectMail(getPool(), req.params.code);
    if (!mail) return res.status(404).json({ error: '项目不存在' });
    res.json({ mail });
  } catch (e) {
    res.status(500).json({ error: `预览失败：${e.message}` });
  }
});

async function writeLog(pool, mail, status, error) {
  await pool.query(
    `INSERT INTO mail_logs (project_code, report_date, subject, to_addr, cc_addr, bcc_addr, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mail.projectCode, mail.reportDate, mail.subject,
      mail.to.join(', '), mail.cc.join(', '), mail.bcc.join(', '),
      status, error || null,
    ]
  );
}

// 发送某项目的邮件（人工在预览弹窗确认后调用）
router.post('/send', async (req, res) => {
  try {
    const code = String(req.body?.projectCode ?? '').trim();
    if (!code) return res.status(400).json({ error: '项目编码不能为空' });
    const pool = getPool();
    const mail = await renderProjectMail(pool, code);
    if (!mail) return res.status(404).json({ error: '项目不存在' });
    if (!mail.hasContactRecipients) {
      return res.status(400).json({ error: '该项目没有勾选主送/抄送/密送的收件人' });
    }
    const config = await getEmailConfig();
    if (!configComplete(config)) {
      return res.status(400).json({ error: '邮箱配置不完整，请先到「邮箱配置」页完善' });
    }
    try {
      const { sentFolder } = await sendAndArchive(config, {
        to: mail.to, cc: mail.cc, bcc: mail.bcc,
        subject: mail.subject, text: mail.text, html: mail.html,
      });
      await writeLog(pool, mail, 'success', null);
      res.json({ ok: true, message: `发送成功，已存档到「${sentFolder}」` });
    } catch (e) {
      await writeLog(pool, mail, 'failed', e.message);
      res.status(502).json({ error: `发送失败：${e.message}` });
    }
  } catch (e) {
    res.status(500).json({ error: `发送失败：${e.message}` });
  }
});

// 发送记录（最近 50 条）
router.get('/logs', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT l.id, l.project_code, p.project_name, l.report_date, l.subject,
              l.to_addr, l.cc_addr, l.bcc_addr, l.status, l.error, l.created_at
       FROM mail_logs l
       LEFT JOIN projects p ON p.project_code = l.project_code
       ORDER BY l.id DESC LIMIT 50`
    );
    res.json({ logs: rows });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

export default router;
