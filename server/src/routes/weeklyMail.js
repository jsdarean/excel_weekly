import { Router } from 'express';
import { getPool } from '../db.js';
import { getEmailConfig, configComplete, sendAndArchive } from '../mailService.js';

const router = Router();

// 收件人在邮件中的展示格式：姓名<邮箱>
export function formatRecipient(r) {
  return `${r.name}<${r.email}>`;
}

async function writeLog(pool, { templateId, subject, to, cc, bcc, attachment, status, error }) {
  await pool.query(
    `INSERT INTO weekly_mail_logs (template_id, subject, to_addr, cc_addr, bcc_addr, attachment, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [templateId, subject, to.join('、'), cc.join('、'), bcc.join('、'), attachment || null, status, error || null]
  );
}

// 一键发送：收件人取指定模板绑定的 VIP 名单（各模板独立），正文 HTML 由前端生成传入
router.post('/send', async (req, res) => {
  try {
    const subject = String(req.body?.subject ?? '').trim();
    const html = String(req.body?.html ?? '').trim();
    const text = String(req.body?.text ?? '').trim();
    const templateId = Number(req.body?.templateId ?? 0);
    if (!subject) return res.status(400).json({ error: '邮件主题不能为空' });
    if (!html) return res.status(400).json({ error: '邮件正文不能为空，请先生成预览' });
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: '缺少模板参数 templateId' });
    }

    const pool = getPool();
    const [tpl] = await pool.query('SELECT name FROM report_templates WHERE id = ?', [templateId]);
    if (!tpl.length) return res.status(404).json({ error: '模板不存在' });
    const [recipients] = await pool.query(
      'SELECT name, email, send_type FROM vip_recipients WHERE template_id = ? AND enabled = 1',
      [templateId]
    );
    const to = recipients.filter((r) => r.send_type === '主送').map(formatRecipient);
    const cc = recipients.filter((r) => r.send_type === '抄送').map(formatRecipient);
    const bcc = recipients.filter((r) => r.send_type === '密送').map(formatRecipient);
    if (to.length === 0) {
      return res.status(400).json({ error: `模板「${tpl[0].name}」没有主送人员，请先在「VIP 收件人」中设置` });
    }

    const config = await getEmailConfig();
    if (!configComplete(config)) {
      return res.status(400).json({ error: '邮箱配置不完整，请先到「邮箱配置」页完善' });
    }

    // 可选附件：Excel（filename + base64 内容），模板开启"附带附件"时由前端生成传入
    const att = req.body?.attachment;
    let attachment = null;
    if (att) {
      const filename = String(att.filename ?? '').trim();
      const contentBase64 = String(att.contentBase64 ?? '').trim();
      if (!filename || !contentBase64) {
        return res.status(400).json({ error: '附件参数不完整（filename / contentBase64）' });
      }
      attachment = { filename, content: Buffer.from(contentBase64, 'base64') };
    }

    try {
      const { sentFolder } = await sendAndArchive(config, { to, cc, bcc, subject, text, html, attachments: attachment ? [attachment] : [] });
      await writeLog(pool, { templateId, subject, to, cc, bcc, attachment: attachment?.filename, status: '成功' });
      return res.json({ ok: true, message: sentFolder ? `发送成功，已存档到「${sentFolder}」` : '发送成功' });
    } catch (e) {
      // 仅 IMAP 存档失败时 SMTP 已成功发送：状态记成功，错误信息留存备查
      const archiveOnly = /IMAP|追加|存档/.test(e.message);
      await writeLog(pool, {
        templateId, subject, to, cc, bcc, attachment: attachment?.filename,
        status: archiveOnly ? '成功' : '失败',
        error: archiveOnly ? `IMAP 存档失败：${e.message}` : e.message,
      });
      if (archiveOnly) {
        return res.json({ ok: true, imapOk: false, message: `邮件已发送，但已发送存档失败：${e.message}` });
      }
      return res.status(502).json({ error: `发送失败：${e.message}` });
    }
  } catch (e) {
    res.status(500).json({ error: `发送失败：${e.message}` });
  }
});

// 发送记录（最近 50 条）
router.get('/logs', async (req, res) => {
  try {
    const templateId = Number(req.query.template_id ?? 0);
    const [rows] = await getPool().query(
      `SELECT id, subject, to_addr, cc_addr, bcc_addr, attachment, status, error, created_at
       FROM weekly_mail_logs
       WHERE template_id = ? ORDER BY id DESC LIMIT 50`,
      [Number.isInteger(templateId) && templateId > 0 ? templateId : -1]
    );
    res.json({ logs: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
