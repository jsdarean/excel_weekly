// 邮件发送 + IMAP 已发送存档（方案 A）
// IMAP 配置由 SMTP 自动推断：smtp.xxx.com → imap.xxx.com:993（TLS）
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import Imap from 'imap';
import { getPool } from './db.js';
import { decryptText } from './utils/crypto.js';

// 已发送文件夹候选名（不同邮件系统命名不同）
const SENT_CANDIDATES = ['已发送', 'Sent', 'Sent Items', 'Sent Mail', '已发邮件', 'INBOX.Sent', 'INBOX.已发送'];
const IMAP_TIMEOUT_MS = 15000;

export function inferImapHost(smtpHost) {
  return String(smtpHost).replace(/^smtp\./i, 'imap.');
}

// 读取邮箱配置（含解密后的授权码）；未配置返回 null
export async function getEmailConfig() {
  const [rows] = await getPool().query('SELECT * FROM email_config WHERE id = 1');
  if (!rows.length) return null;
  const r = rows[0];
  return {
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port || 465,
    smtpSecure: !!r.smtp_secure,
    smtpUser: r.smtp_user,
    smtpPass: r.smtp_pass_enc ? decryptText(r.smtp_pass_enc) : '',
    fromName: r.from_name || '',
    fromAddr: r.from_addr || r.smtp_user,
  };
}

export function configComplete(c) {
  return !!(c && c.smtpHost && c.smtpUser && c.smtpPass);
}

function fromHeader(config) {
  const addr = config.fromAddr || config.smtpUser;
  return config.fromName ? `"${config.fromName}" <${addr}>` : addr;
}

// 发送邮件并存档到「已发送」；存档失败不影响发送结果，通过返回值体现
// to/cc/bcc 均可传字符串或字符串数组；attachments 为 nodemailer 附件（如 CID 内嵌图片）
export async function sendAndArchive(config, { to, cc, bcc, subject, text, html, attachments }) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  const message = {
    from: fromHeader(config),
    to,
    subject,
    text,
    html,
    date: new Date(), // 系统时区已固定为 Asia/Shanghai，Date 头为 +0800
  };
  if (cc && cc.length) message.cc = cc;
  if (bcc && bcc.length) message.bcc = bcc;
  if (attachments && attachments.length) message.attachments = attachments;
  await transporter.sendMail(message);
  const raw = await new MailComposer(message).compile().build();
  const folder = await appendToSent(config, raw, message.date);
  return { sentFolder: folder };
}

// 通过 IMAP 把原始 MIME 追加到已发送文件夹；返回实际使用的文件夹名
function appendToSent(config, raw, date) {
  return new Promise((resolve, reject) => {
    const imapHost = inferImapHost(config.smtpHost);
    const imap = new Imap({
      user: config.smtpUser,
      password: config.smtpPass,
      host: imapHost,
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: IMAP_TIMEOUT_MS,
      authTimeout: IMAP_TIMEOUT_MS,
    });
    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      try { imap.end(); } catch { /* 忽略关闭异常 */ }
      fn(val);
    };
    const timer = setTimeout(() => finish(reject, new Error('IMAP 存档超时')), IMAP_TIMEOUT_MS * 2);

    imap.once('ready', () => {
      imap.getBoxes((err, boxes) => {
        if (err) {
          clearTimeout(timer);
          return finish(reject, new Error(`获取文件夹列表失败: ${err.message}`));
        }
        const folder = findSentBox(boxes, '') || '已发送';
        imap.append(raw, { mailbox: folder, flags: ['\\Seen'], date }, (e2) => {
          clearTimeout(timer);
          if (e2) return finish(reject, new Error(`追加到「${folder}」失败: ${e2.message}`));
          finish(resolve, folder);
        });
      });
    });
    imap.once('error', (e) => {
      clearTimeout(timer);
      finish(reject, new Error(`IMAP 连接失败（${imapHost}:993）: ${e.message}`));
    });
    imap.connect();
  });
}

function findSentBox(boxList, parentPath) {
  for (const [name, box] of Object.entries(boxList)) {
    const fullPath = parentPath ? `${parentPath}${box.delimiter}${name}` : name;
    if (SENT_CANDIDATES.includes(name) || SENT_CANDIDATES.includes(fullPath)) return fullPath;
    if (box.children) {
      const hit = findSentBox(box.children, fullPath);
      if (hit) return hit;
    }
  }
  return null;
}
