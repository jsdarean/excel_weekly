// 批量邮件：模板存取、占位符渲染、HTML 外壳、按项目组装邮件数据
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 中国移动白色 LOGO：放在 server/assets/cmcc-logo-white.png 即启用（CID 附件嵌入邮件）
export const LOGO_PATH = path.join(__dirname, '../assets/cmcc-logo-white.png');
export const LOGO_CID = 'cmcc-logo';
export function hasLogoFile() {
  return fs.existsSync(LOGO_PATH);
}

export const DEFAULT_TEMPLATE = {
  subject: '【项目进展通报】{{项目名称}}（{{周报日期}}）',
  card: `项目名称：{{项目名称}}
项目编码：{{项目编码}}
建设内容：{{建设内容}}
立项金额（万元）：{{立项金额}}
项目阶段：{{项目阶段}}
工程责任人：{{工程责任人}}
周报日期：{{周报日期}}
{{需求信息表}}`,
  body: `各位领导、同事：

您好！现将您所关注项目的本周进展通报如下。

「{{项目名称}}」（项目编码：{{项目编码}}）本周主要进展：
{{周进展}}

本项目建设内容：{{建设内容}}`,
  signature: `感谢您对工程建设工作的支持！如对本项目进展有任何疑问，欢迎随时联系项目工程责任人：{{工程责任人}}（电话：{{责任人电话}}；邮箱：{{责任人邮箱}}）。`,
};

// 读取模板；未保存过时返回默认模板（不落库）
export async function getTemplate() {
  const [rows] = await getPool().query('SELECT subject, card, body, signature FROM mail_template WHERE id = 1');
  if (!rows.length) return { ...DEFAULT_TEMPLATE };
  return {
    subject: rows[0].subject ?? '',
    // 旧数据 card 为 NULL（未配置过）时回退默认卡片；用户明确保存为空字符串则表示不显示卡片
    card: rows[0].card ?? DEFAULT_TEMPLATE.card,
    body: rows[0].body ?? '',
    signature: rows[0].signature ?? '',
  };
}

export async function saveTemplate({ subject, card, body, signature }) {
  await getPool().query(
    `INSERT INTO mail_template (id, subject, card, body, signature) VALUES (1, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE subject = VALUES(subject), card = VALUES(card), body = VALUES(body), signature = VALUES(signature)`,
    [subject, card, body, signature]
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
// cardRows：信息卡片行 [{label, value} | {type:'demand'}]，空数组则不渲染卡片
// demandRows：需求信息表行 [{org, owner}]，供 type:'demand' 的卡片行渲染
// hasLogo：为 true 时页头左侧显示中国移动 LOGO（CID 附件，cid:cmcc-logo）
export function buildHtmlEmail({ cardRows, demandRows = [], bodyText, signatureText, hasLogo = false }) {
  const metaRow = (label, value) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;color:#111827;font-size:13px;">${escapeHtml(value)}</td></tr>`;
  const demandTable = demandRows.length
    ? `<table style="border-collapse:collapse;width:100%;" cellpadding="0" cellspacing="0">
        <tr>
          <th style="border:1px solid #e5e7eb;background:#eef2f7;color:#374151;font-size:12px;padding:6px 10px;text-align:left;font-weight:600;">需求部门/科室</th>
          <th style="border:1px solid #e5e7eb;background:#eef2f7;color:#374151;font-size:12px;padding:6px 10px;text-align:left;font-weight:600;">需求人</th>
        </tr>
        ${demandRows.map((r) =>
          `<tr><td style="border:1px solid #e5e7eb;color:#111827;font-size:13px;padding:6px 10px;">${escapeHtml(r.org)}</td>` +
          `<td style="border:1px solid #e5e7eb;color:#111827;font-size:13px;padding:6px 10px;">${escapeHtml(r.owner)}</td></tr>`
        ).join('')}
      </table>`
    : '<span style="color:#9ca3af;font-size:13px;">（无）</span>';
  const cardRowHtml = (r) =>
    r.type === 'demand'
      ? `<tr><td colspan="2" style="padding:6px 0;">${demandTable}</td></tr>`
      : metaRow(r.label, r.value);
  const cardHtml = cardRows.length
    ? `<table style="border-collapse:collapse;background:#f9fafb;border:1px solid #eef0f2;border-radius:6px;width:100%;margin-bottom:20px;" cellpadding="0" cellspacing="0">
      <tbody style="display:table-row-group;">
        <tr><td style="padding:12px 16px;" colspan="2">
          <table style="border-collapse:collapse;width:100%;" cellpadding="0" cellspacing="0"><tbody>
            ${cardRows.map(cardRowHtml).join('')}
          </tbody></table>
        </td></tr>
      </tbody>
    </table>`
    : '';
  const logoImg = hasLogo
    ? `<img src="cid:cmcc-logo" alt="中国移动" style="height:32px;display:block;margin-right:12px;"/>`
    : '';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;">
  <div style="background:#0086d4;background:linear-gradient(90deg,#0086d4 0%,#55b4e4 45%,#ffffff 100%);border-radius:8px 8px 0 0;padding:20px 28px;">
    <table style="border-collapse:collapse;" cellpadding="0" cellspacing="0"><tbody><tr>
      ${hasLogo ? `<td style="vertical-align:middle;">${logoImg}</td>` : ''}
      <td style="vertical-align:middle;">
        <div style="color:#ffffff;font-size:18px;font-weight:bold;">项目进展信息</div>
        <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:4px;">工程建设部 · 核心网室</div>
      </td>
    </tr></tbody></table>
  </div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:24px 28px;">
    ${cardHtml}
    <div style="color:#1f2937;font-size:14px;line-height:1.9;">
      ${textToParagraphs(bodyText)}
    </div>
    <div style="border-top:1px solid #e5e7eb;margin-top:8px;padding-top:16px;color:#4b5563;font-size:13px;line-height:1.9;">
      ${textToParagraphs(signatureText)}
    </div>
  </div>
  <div style="padding:12px 8px;color:#9ca3af;font-size:12px;">本邮件由工程进展数智管理系统发送</div>
</div>
</body></html>`;
}

// 收件人格式：姓名<邮箱>（nodemailer 支持该格式）；无姓名时仅邮箱
function fmtAddr(a) {
  return a.name ? `${a.name}<${a.email}>` : a.email;
}

// 通用抄送人：批量邮件页配置的名单（enabled=1，按 sort_order 排序）
async function getGlobalCc(pool) {
  const [rows] = await pool.query(
    'SELECT name, email FROM mail_cc_list WHERE enabled = 1 ORDER BY sort_order, id'
  );
  return rows;
}

// 抄送列表 = 关联人勾选抄送 + 通用抄送人 + 工程责任人（均为 {name, email}）；
// 按邮箱去重，且已在主送中的地址不再重复抄送
export function buildCcList(contactCc, globalCc, owner, contactTo) {
  const toSet = new Set(contactTo.map((a) => a.email));
  const seen = new Set();
  const out = [];
  for (const a of [...contactCc, ...globalCc, owner]) {
    if (!a || !a.email || seen.has(a.email) || toSet.has(a.email)) continue;
    seen.add(a.email);
    out.push(a);
  }
  return out;
}

// 按项目组装邮件数据：项目基础信息 + 最新一周进展 + 工程责任人联系方式 + 收件人分组
export async function buildMailData(pool, projectCode) {
  const [prows] = await pool.query(
    'SELECT project_code, project_name, content, owner, budget_wan, stage, demand_dept, demand_room, demand_owner FROM projects WHERE project_code = ?',
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

  // 抄送默认追加：通用抄送人 + 本项目工程责任人（排最后）
  const globalCc = await getGlobalCc(pool);
  const contactTo = contacts.filter((c) => c.send_to);
  const contactCc = contacts.filter((c) => c.send_cc);
  const contactBcc = contacts.filter((c) => c.send_bcc);
  const owner = { name: p.owner || '', email: ownerEmail };
  const cc = buildCcList(contactCc, globalCc, owner, contactTo);

  // 校验：需求人（按 / 拆分）是否出现在主送/抄送（含通用抄送人与工程责任人）中
  const demandRows = pairDemandRows(p.demand_dept, p.demand_room, p.demand_owner);
  const recipientNames = new Set(
    [...contactTo, ...contactCc, ...globalCc, owner]
      .map((a) => a && a.name)
      .filter(Boolean)
  );
  const seenNames = new Set();
  const missingDemandOwners = [];
  for (const r of demandRows) {
    if (!r.owner || recipientNames.has(r.owner) || seenNames.has(r.owner)) continue;
    seenNames.add(r.owner);
    missingDemandOwners.push({ name: r.owner, dept: r.dept, room: r.room });
  }

  const progress = latest && String(latest.progress ?? '').trim() ? latest.progress.trim() : '本周暂无进展';
  return {
    projectCode: p.project_code,
    placeholders: {
      '项目名称': p.project_name || '',
      '项目编码': p.project_code,
      '周进展': progress,
      '建设内容': p.content || '',
      '立项金额': p.budget_wan === null || p.budget_wan === undefined ? '' : String(Number(p.budget_wan)),
      '项目阶段': p.stage || '',
      '工程责任人': p.owner || '',
      '责任人电话': ownerPhone,
      '责任人邮箱': ownerEmail,
      '周报日期': latest ? latest.report_date : '',
    },
    reportDate: latest ? latest.report_date : null,
    demandRows,
    missingDemandOwners,
    to: contactTo.map(fmtAddr),
    cc: cc.map(fmtAddr),
    bcc: contactBcc.map(fmtAddr),
    // 是否有关联人勾选的收件人（不含默认追加的通用抄送/责任人），决定项目可否发送
    hasContactRecipients: contactTo.length + contactCc.length + contactBcc.length > 0,
  };
}

// 解析信息卡片模板：每行一条「标签：值」，值支持占位符；空行忽略
// 单独一行的 {{需求信息表}} 是特殊标记：渲染为「需求部门/科室 | 需求人」两行表格
export const DEMAND_TABLE_MARKER = '{{需求信息表}}';

export function parseCardTemplate(cardText, placeholders) {
  const rows = [];
  for (const line of String(cardText ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t === DEMAND_TABLE_MARKER) {
      rows.push({ type: 'demand' });
      continue;
    }
    const sep = t.search(/[：:]/);
    if (sep < 0) {
      rows.push({ label: '', value: renderPlaceholders(t, placeholders) });
    } else {
      rows.push({
        label: t.slice(0, sep).trim(),
        value: renderPlaceholders(t.slice(sep + 1).trim(), placeholders),
      });
    }
  }
  return rows;
}

// 需求部门/科室/需求人按 / 拆分后按位置配对成行
export function pairDemandRows(dept, room, owner) {
  const split = (v) => String(v ?? '').split('/').map((s) => s.trim()).filter(Boolean);
  const depts = split(dept);
  const rooms = split(room);
  const owners = split(owner);
  const n = Math.max(depts.length, rooms.length, owners.length);
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      org: [depts[i], rooms[i]].filter(Boolean).join('/'),
      dept: depts[i] || '',
      room: rooms[i] || '',
      owner: owners[i] || '',
    });
  }
  return rows;
}

// 渲染某项目的完整邮件（主题/纯文本/HTML/收件人）
export async function renderProjectMail(pool, projectCode) {
  const data = await buildMailData(pool, projectCode);
  if (!data) return null;
  const tpl = await getTemplate();
  const subject = renderPlaceholders(tpl.subject, data.placeholders);
  const bodyText = renderPlaceholders(tpl.body, data.placeholders);
  const signatureText = renderPlaceholders(tpl.signature, data.placeholders);
  const cardRows = parseCardTemplate(tpl.card, data.placeholders);
  const hasLogo = hasLogoFile();
  const html = buildHtmlEmail({ cardRows, demandRows: data.demandRows, bodyText, signatureText, hasLogo });
  return {
    projectCode: data.projectCode,
    reportDate: data.reportDate,
    subject,
    text: `${bodyText}\n\n${signatureText}`,
    html,
    hasLogo,
    to: data.to,
    cc: data.cc,
    bcc: data.bcc,
    hasContactRecipients: data.hasContactRecipients,
    missingDemandOwners: data.missingDemandOwners,
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
  const globalCc = await getGlobalCc(pool);
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
    const cc = buildCcList(contactCc, globalCc, owner, to);
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
