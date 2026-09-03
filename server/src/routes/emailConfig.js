import { Router } from 'express';
import { getPool } from '../db.js';
import { encryptText } from '../utils/crypto.js';
import { getEmailConfig, configComplete, sendAndArchive, inferImapHost } from '../mailService.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 读取配置（授权码永不回传，只告知是否已设置）
router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT * FROM email_config WHERE id = 1');
    if (!rows.length) return res.json({ config: null });
    const r = rows[0];
    res.json({
      config: {
        smtpHost: r.smtp_host ?? '',
        smtpPort: r.smtp_port ?? 465,
        smtpSecure: !!r.smtp_secure,
        smtpUser: r.smtp_user ?? '',
        fromName: r.from_name ?? '',
        fromAddr: r.from_addr ?? '',
        hasPassword: !!r.smtp_pass_enc,
        // 展示用：系统据 SMTP 推断的 IMAP 地址
        imapInferred: r.smtp_host ? `${inferImapHost(r.smtp_host)}:993` : '',
      },
    });
  } catch (e) {
    res.status(500).json({ error: `读取失败：${e.message}` });
  }
});

// 保存配置（smtpPass 留空表示不修改）
router.put('/', async (req, res) => {
  try {
    const b = req.body ?? {};
    const smtpHost = String(b.smtpHost ?? '').trim();
    const smtpUser = String(b.smtpUser ?? '').trim();
    if (!smtpHost) return res.status(400).json({ error: 'SMTP 服务器不能为空' });
    if (!smtpUser) return res.status(400).json({ error: '邮箱账号不能为空' });
    const smtpPort = Number.parseInt(b.smtpPort, 10) || 465;
    const smtpSecure = b.smtpSecure ? 1 : 0;
    const fromName = String(b.fromName ?? '').trim();
    const fromAddr = String(b.fromAddr ?? '').trim();
    const smtpPass = String(b.smtpPass ?? '');

    const pool = getPool();
    const [rows] = await pool.query('SELECT smtp_pass_enc FROM email_config WHERE id = 1');
    let passEnc = rows.length ? rows[0].smtp_pass_enc : null;
    if (smtpPass) passEnc = encryptText(smtpPass);
    if (!passEnc) return res.status(400).json({ error: '首次配置必须填写授权码/密码' });

    await pool.query(
      `INSERT INTO email_config (id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc, from_name, from_addr)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE smtp_host = VALUES(smtp_host), smtp_port = VALUES(smtp_port),
         smtp_secure = VALUES(smtp_secure), smtp_user = VALUES(smtp_user),
         smtp_pass_enc = VALUES(smtp_pass_enc), from_name = VALUES(from_name), from_addr = VALUES(from_addr)`,
      [smtpHost, smtpPort, smtpSecure, smtpUser, passEnc, fromName, fromAddr]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 发送测试邮件（走完整链路：SMTP 发送 + IMAP 已发送存档）
router.post('/test', async (req, res) => {
  try {
    const to = String(req.body?.to ?? '').trim();
    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: '测试收件地址格式不正确' });
    const config = await getEmailConfig();
    if (!configComplete(config)) {
      return res.status(400).json({ error: '邮箱配置不完整，请先完善并保存配置' });
    }
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    try {
      await sendAndArchive(config, {
        to,
        subject: '【工程进展数智管理系统】邮箱配置测试邮件',
        text: `这是一封来自工程进展数智管理系统的测试邮件，用于验证 SMTP 发送与 IMAP 已发送存档。\n\n发送时间（北京时间）：${now}\n\n如收到本邮件，说明邮箱配置可用。`,
      });
      res.json({ ok: true, message: `发送成功，已存档到「已发送」（北京时间 ${now}）` });
    } catch (e) {
      // 区分发送失败与存档失败
      if (/IMAP|追加|存档/.test(e.message)) {
        return res.json({ ok: true, imapOk: false, message: `邮件已发送，但已发送存档失败：${e.message}` });
      }
      res.status(502).json({ error: `发送失败：${e.message}` });
    }
  } catch (e) {
    res.status(500).json({ error: `测试失败：${e.message}` });
  }
});

export default router;
