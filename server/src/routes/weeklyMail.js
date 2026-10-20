import { Router } from 'express';
import { getPool } from '../db.js';
import { getEmailConfig, configComplete, sendAndArchive } from '../mailService.js';

const router = Router();

// 收件人在邮件中的展示格式：姓名<邮箱>
export function formatRecipient(r) {
  return `${r.name}<${r.email}>`;
}

// 配置：主题（可留空，留空时前端生成默认主题）+ 签名
router.get('/config', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT subject, signature FROM weekly_mail_config WHERE id = 1'
    );
    res.json({
      subject: rows[0]?.subject ?? '',
      signature: rows[0]?.signature ?? '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const subject = String(req.body?.subject ?? '').trim();
    const signature = String(req.body?.signature ?? '');
    await getPool().query(
      `INSERT INTO weekly_mail_config (id, subject, signature) VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE subject = VALUES(subject), signature = VALUES(signature)`,
      [subject, signature]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function writeLog(pool, { subject, to, cc, bcc, status, error }) {
  await pool.query(
    `INSERT INTO weekly_mail_logs (subject, to_addr, cc_addr, bcc_addr, status, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [subject, to.join('、'), cc.join('、'), bcc.join('、'), status, error || null]
  );
}

// 一键发送：收件人从 vip_recipients 按发送方式组装，正文 HTML 由前端生成传入
router.post('/send', async (req, res) => {
  try {
    const subject = String(req.body?.subject ?? '').trim();
    const html = String(req.body?.html ?? '').trim();
    const text = String(req.body?.text ?? '').trim();
    if (!subject) return res.status(400).json({ error: '邮件主题不能为空' });
    if (!html) return res.status(400).json({ error: '邮件正文不能为空，请先生成预览' });

    const pool = getPool();
    const [recipients] = await pool.query(
      'SELECT name, email, send_type FROM vip_recipients'
    );
    const to = recipients.filter((r) => r.send_type === '主送').map(formatRecipient);
    const cc = recipients.filter((r) => r.send_type === '抄送').map(formatRecipient);
    const bcc = recipients.filter((r) => r.send_type === '密送').map(formatRecipient);
    if (to.length === 0) {
      return res.status(400).json({ error: 'VIP 收件人中没有主送人员，请先在「VIP 收件人」中设置' });
    }

    const config = await getEmailConfig();
    if (!configComplete(config)) {
      return res.status(400).json({ error: '邮箱配置不完整，请先到「邮箱配置」页完善' });
    }

    try {
      const { sentFolder } = await sendAndArchive(config, { to, cc, bcc, subject, text, html });
      await writeLog(pool, { subject, to, cc, bcc, status: '成功' });
      return res.json({ ok: true, message: sentFolder ? `发送成功，已存档到「${sentFolder}」` : '发送成功' });
    } catch (e) {
      // 仅 IMAP 存档失败时 SMTP 已成功发送：状态记成功，错误信息留存备查
      const archiveOnly = /IMAP|追加|存档/.test(e.message);
      await writeLog(pool, {
        subject, to, cc, bcc,
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
    const [rows] = await getPool().query(
      `SELECT id, subject, to_addr, cc_addr, bcc_addr, status, error, created_at
       FROM weekly_mail_logs ORDER BY id DESC LIMIT 50`
    );
    res.json({ logs: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
