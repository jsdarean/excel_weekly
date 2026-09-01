// 批量邮件：模板存取、占位符渲染、HTML 外壳、按项目组装邮件数据
import { getPool } from './db.js';

export const DEFAULT_TEMPLATE = {
  subject: '【项目进展通报】{{项目名称}}（{{周报日期}}）',
  body: `各位领导、同事：

您好！现将您所关注项目的本周进展通报如下。

「{{项目名称}}」（项目编码：{{项目编码}}）本周主要进展：
{{周进展}}

本项目建设内容：{{建设内容}}`,
  signature: `感谢您对工程建设工作的支持！如对本项目进展有任何疑问，欢迎随时联系项目工程责任人：{{工程责任人}}（电话：{{责任人电话}}；邮箱：{{责任人邮箱}}）。`,
};

// 读取模板；未保存过时返回默认模板（不落库）
export async function getTemplate() {
  const [rows] = await getPool().query('SELECT subject, body, signature FROM mail_template WHERE id = 1');
  if (!rows.length) return { ...DEFAULT_TEMPLATE };
  return {
    subject: rows[0].subject ?? '',
    body: rows[0].body ?? '',
    signature: rows[0].signature ?? '',
  };
}

export async function saveTemplate({ subject, body, signature }) {
  await getPool().query(
    `INSERT INTO mail_template (id, subject, body, signature) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE subject = VALUES(subject), body = VALUES(body), signature = VALUES(signature)`,
    [subject, body, signature]
  );
}

// 占位符渲染（纯函数）：{{项目名称}} 等替换为 data 中的值，未知占位符原样保留
export function renderPlaceholders(text, data) {
  return String(text ?? '').replace(/\{\{([^{}]+)\}\}/g, (m, key) => {
    const v = data[key.trim()];
    return v === undefined || v === null ? '' : String(v);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 纯文本 → HTML 段落：空行分段，段内换行 <br>
function textToParagraphs(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// 商务风格 HTML 外壳（全部内联样式，兼容主流邮件客户端）
export function buildHtmlEmail({ projectName, projectCode, content, budgetWan, stage, owner, reportDate, bodyText, signatureText }) {
  const metaRow = (label, value) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>` +
    `<td style="padding:6px 0;color:#111827;font-size:13px;">${escapeHtml(value)}</td></tr>`;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;">
  <div style="background:#1f4e79;border-radius:8px 8px 0 0;padding:20px 28px;">
    <div style="color:#ffffff;font-size:18px;font-weight:bold;">项目进展通报</div>
    <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:4px;">工程建设部 · 核心网室</div>
  </div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:24px 28px;">
    <table style="border-collapse:collapse;background:#f9fafb;border:1px solid #eef0f2;border-radius:6px;width:100%;margin-bottom:20px;" cellpadding="0" cellspacing="0">
      <tbody style="display:table-row-group;">
        <tr><td style="padding:12px 16px;" colspan="2">
          <table style="border-collapse:collapse;" cellpadding="0" cellspacing="0"><tbody>
            ${metaRow('项目名称', projectName)}
            ${metaRow('项目编码', projectCode)}
            ${metaRow('建设内容', content)}
            ${metaRow('立项金额（万元）', budgetWan)}
            ${metaRow('项目阶段', stage)}
            ${metaRow('工程责任人', owner)}
            ${metaRow('周报日期', reportDate)}
          </tbody></table>
        </td></tr>
      </tbody>
    </table>
    <div style="color:#1f2937;font-size:14px;line-height:1.9;">
      ${textToParagraphs(bodyText)}
    </div>
    <div style="border-top:1px solid #e5e7eb;margin-top:8px;padding-top:16px;color:#4b5563;font-size:13px;line-height:1.9;">
      ${textToParagraphs(signatureText)}
    </div>
  </div>
  <div style="padding:12px 8px;color:#9ca3af;font-size:12px;">本邮件由工程周报管理系统发送</div>
</div>
</body></html>`;
}

// 收件人格式：姓名<邮箱>（nodemailer 支持该格式）；无姓名时仅邮箱
function fmtAddr(a) {
  return a.name ? `${a.name}<${a.email}>` : a.email;
}

// 抄送默认追加：人员配置中职务为 总经理/副总/室经理 的人员（按职务顺序）
async function getLeaderContacts(pool) {
  const [rows] = await pool.query(
    `SELECT name, email FROM persons
     WHERE title IN ('总经理', '副总', '室经理') AND email IS NOT NULL AND email <> ''
     ORDER BY FIELD(title, '总经理', '副总', '室经理'), id`
  );
  return rows;
}

// 抄送列表 = 关联人勾选抄送 + 总经理/副总/室经理 + 工程责任人（均为 {name, email}）；
// 按邮箱去重，且已在主送中的地址不再重复抄送
export function buildCcList(contactCc, leaders, owner, contactTo) {
  const toSet = new Set(contactTo.map((a) => a.email));
  const seen = new Set();
  const out = [];
  for (const a of [...contactCc, ...leaders, owner]) {
    if (!a || !a.email || seen.has(a.email) || toSet.has(a.email)) continue;
    seen.add(a.email);
    out.push(a);
  }
  return out;
}

// 按项目组装邮件数据：项目基础信息 + 最新一周进展 + 工程责任人联系方式 + 收件人分组
export async function buildMailData(pool, projectCode) {
  const [prows] = await pool.query(
    'SELECT project_code, project_name, content, owner, budget_wan, stage FROM projects WHERE project_code = ?',
    [projectCode]
  );
  if (!prows.length) return null;
  const p = prows[0];

  const [wrows] = await pool.query(
    'SELECT report_date, progress FROM weekly_progress WHERE project_code = ? ORDER BY report_date DESC LIMIT 1',
    [projectCode]
  );
  const latest = wrows[0] || null;

  // 工程责任人联系方式：projects.owner → persons.name
  let ownerPhone = '';
  let ownerEmail = '';
  if (p.owner) {
    const [persons] = await pool.query(
      'SELECT phone, email FROM persons WHERE name = ? LIMIT 1',
      [p.owner]
    );
    if (persons.length) {
      ownerPhone = persons[0].phone || '';
      ownerEmail = persons[0].email || '';
    }
  }

  const [contacts] = await pool.query(
    `SELECT name, email, send_to, send_cc, send_bcc FROM project_contacts
     WHERE project_code = ? AND (send_to = 1 OR send_cc = 1 OR send_bcc = 1) AND email IS NOT NULL AND email <> ''
     ORDER BY id`,
    [projectCode]
  );

  // 抄送默认追加：人员配置中职务为 总经理/副总/室经理 的人员 + 本项目工程责任人
  const leaders = await getLeaderContacts(pool);
  const contactTo = contacts.filter((c) => c.send_to);
  const contactCc = contacts.filter((c) => c.send_cc);
  const contactBcc = contacts.filter((c) => c.send_bcc);
  const owner = { name: p.owner || '', email: ownerEmail };
  const cc = buildCcList(contactCc, leaders, owner, contactTo);

  const progress = latest && String(latest.progress ?? '').trim() ? latest.progress.trim() : '本周暂无进展';
  return {
    projectCode: p.project_code,
    placeholders: {
      '项目名称': p.project_name || '',
      '项目编码': p.project_code,
      '周进展': progress,
      '建设内容': p.content || '',
      '工程责任人': p.owner || '',
      '责任人电话': ownerPhone,
      '责任人邮箱': ownerEmail,
      '周报日期': latest ? latest.report_date : '',
    },
    reportDate: latest ? latest.report_date : null,
    budgetWan: p.budget_wan === null || p.budget_wan === undefined ? '' : String(Number(p.budget_wan)),
    stage: p.stage || '',
    to: contactTo.map(fmtAddr),
    cc: cc.map(fmtAddr),
    bcc: contactBcc.map(fmtAddr),
    // 是否有关联人勾选的收件人（不含默认追加的领导/责任人抄送），决定项目可否发送
    hasContactRecipients: contactTo.length + contactCc.length + contactBcc.length > 0,
  };
}

// 渲染某项目的完整邮件（主题/纯文本/HTML/收件人）
export async function renderProjectMail(pool, projectCode) {
  const data = await buildMailData(pool, projectCode);
  if (!data) return null;
  const tpl = await getTemplate();
  const subject = renderPlaceholders(tpl.subject, data.placeholders);
  const bodyText = renderPlaceholders(tpl.body, data.placeholders);
  const signatureText = renderPlaceholders(tpl.signature, data.placeholders);
  const html = buildHtmlEmail({
    projectName: data.placeholders['项目名称'],
    projectCode: data.projectCode,
    content: data.placeholders['建设内容'],
    budgetWan: data.budgetWan,
    stage: data.stage,
    owner: data.placeholders['工程责任人'],
    reportDate: data.reportDate || '',
    bodyText,
    signatureText,
  });
  return {
    projectCode: data.projectCode,
    reportDate: data.reportDate,
    subject,
    text: `${bodyText}\n\n${signatureText}`,
    html,
    to: data.to,
    cc: data.cc,
    bcc: data.bcc,
    hasContactRecipients: data.hasContactRecipients,
  };
}

// 批量邮件页项目列表：有勾选收件人的项目 + 最新进展日期 + 该周是否已发送
// 收件人统计口径与实际发送一致：抄送含默认追加的总经理/副总/室经理及工程责任人
export async function listMailProjects(pool) {
  const [contacts] = await pool.query(
    `SELECT c.project_code, c.name, c.email, c.send_to, c.send_cc, c.send_bcc
     FROM project_contacts c
     WHERE (c.send_to = 1 OR c.send_cc = 1 OR c.send_bcc = 1) AND c.email IS NOT NULL AND c.email <> ''
     ORDER BY c.id`
  );
  if (!contacts.length) return [];
  const codes = [...new Set(contacts.map((c) => c.project_code))];
  const [prows] = await pool.query(
    `SELECT p.project_code, p.project_name, p.owner,
            (SELECT MAX(w.report_date) FROM weekly_progress w WHERE w.project_code = p.project_code) AS report_date
     FROM projects p WHERE p.project_code IN (?)
     ORDER BY p.project_code`,
    [codes]
  );
  const ownerNames = [...new Set(prows.map((p) => p.owner).filter(Boolean))];
  const ownerEmails = new Map();
  if (ownerNames.length) {
    const [persons] = await pool.query(
      'SELECT name, email FROM persons WHERE name IN (?)',
      [ownerNames]
    );
    for (const r of persons) {
      if (r.email) ownerEmails.set(r.name, r.email);
    }
  }
  const leaderContacts = await getLeaderContacts(pool);
  // 标记每个项目最新进展周是否已成功发送过
  const [logs] = await pool.query(
    "SELECT project_code, report_date FROM mail_logs WHERE status = 'success'"
  );
  const sentSet = new Set(logs.map((l) => `${l.project_code}|${l.report_date}`));

  const byCode = new Map();
  for (const c of contacts) {
    if (!byCode.has(c.project_code)) byCode.set(c.project_code, []);
    byCode.get(c.project_code).push(c);
  }
  return prows.map((r) => {
    const list = byCode.get(r.project_code) || [];
    const to = list.filter((c) => c.send_to);
    const contactCc = list.filter((c) => c.send_cc);
    const bcc = list.filter((c) => c.send_bcc);
    const owner = { name: r.owner || '', email: ownerEmails.get(r.owner) || '' };
    const cc = buildCcList(contactCc, leaderContacts, owner, to);
    return {
      projectCode: r.project_code,
      projectName: r.project_name,
      owner: r.owner,
      toCount: to.length,
      ccCount: cc.length,
      bccCount: bcc.length,
      reportDate: r.report_date,
      sentThisWeek: r.report_date ? sentSet.has(`${r.project_code}|${r.report_date}`) : false,
    };
  });
}
