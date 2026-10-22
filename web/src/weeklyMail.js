// 周报邮件：商务外壳 / 默认主题 / 签名渲染（纯逻辑，便于测试）

// 外壳标题与默认主题前缀
export const WEEKLY_MAIL_TITLE = '省本部重点工程项目进展';

// 默认邮件主题基名（可附加系统时间）
export const DEFAULT_MAIL_SUBJECT = '省本部重点工程项目进展';

// 在文本后按模式拼接日期：none 不拼；day（当天）；week（前6天~当天）；biweek（前13天~当天）
export function appendDateSuffix(base, mode, today) {
  const b = String(base ?? '').trim();
  if (mode === 'day') return `${b}（${today}）`;
  if (mode === 'week') return `${b}（${shiftDate(today, -6)}~${today}）`;
  if (mode === 'biweek') return `${b}（${shiftDate(today, -13)}~${today}）`;
  return b;
}

// 组装最终邮件主题：自定义主题留空用默认基名；mode 决定后缀日期
export function buildMailSubject({ subject = '', mode = 'day', date = '' } = {}) {
  const base = String(subject).trim() || DEFAULT_MAIL_SUBJECT;
  return appendDateSuffix(base, mode, date);
}

// 默认主题：标题（周五日期），用于外壳副标题缺省等场景
export function defaultSubject(reportDate) {
  return `${WEEKLY_MAIL_TITLE}（${reportDate}）`;
}

// 副标题日期模式：在自定义副标题后拼接日期（留空的副标题不再默认日期，空即空）
// mode: none=不拼接；day=（当天）；week=（前6天~当天，一周）；biweek=（前13天~当天，两周）
function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function subtitleWithDate(subtitle, mode, today) {
  return appendDateSuffix(subtitle, mode, today);
}

// 商务外壳：移动蓝标题条（标题 + 副标题）+ 白色正文区
// title 缺省用 WEEKLY_MAIL_TITLE；subtitle 缺省不渲染；用户输入统一 HTML 转义
export function buildEmailShell(innerHtml, { title = '', subtitle = '' } = {}) {
  const t = esc(title) || WEEKLY_MAIL_TITLE;
  const sub = esc(subtitle);
  return `<div style="max-width:640px;margin:0 auto;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;">` +
    `<div style="background:#0086d4;background:linear-gradient(90deg,#0086d4 0%,#55b4e4 60%,#a8d8f0 100%);border-radius:8px 8px 0 0;padding:18px 28px;">` +
    `<div style="color:#ffffff;font-size:18px;font-weight:bold;">${t}</div>` +
    (sub ? `<div style="color:rgba(255,255,255,0.9);font-size:12px;margin-top:4px;">${sub}</div>` : '') +
    `</div>` +
    `<div style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:24px 28px;">${innerHtml}</div>` +
    `</div>`;
}

// 签名渲染：空行分段，段内换行 <br>
export function signatureHtml(signature) {
  const paras = String(signature ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) return '';
  return `<div style="border-top:1px solid #e5e7eb;margin-top:8px;padding-top:16px;color:#4b5563;font-size:13px;line-height:1.9;">` +
    paras.map((p) => `<p style="margin:0 0 8px;">${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`).join('') +
    `</div>`;
}

// 周报正文纯文本 → HTML（按"给公司领导的模板"真实结构渲染）：
// 一、xxx（统计） → 蓝色强调条章节标题 + 灰色统计副标题
// 部分重点项目上周进展： → 小标题条
// 1、项目名，进展… → 编号条目，项目名（第一个逗号前）加粗
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderWeeklyBodyHtml(text) {
  const lines = esc(text ?? '').split('\n');
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) { out.push('</div>'); inList = false; }
  };

  for (const line of lines) {
    // 章节标题：一、收入相关（25个项目，占10%…）→ 标题 + 括号内统计副标题
    const heading = line.match(/^([一二三四五六七八九十]+、[^（(]+?)(?:[（(](.*)[）)])?\s*$/);
    if (heading && /^[一二三四五六七八九十]+、/.test(line) && line.length < 120) {
      closeList();
      const title = heading[1].trim();
      const stats = heading[2]?.trim();
      out.push(
        `<div style="margin:18px 0 10px;padding:8px 12px;border-left:4px solid #0086d4;background:#f0f7fc;border-radius:0 4px 4px 0;">` +
        `<div style="font-size:15px;font-weight:bold;color:#0d3a5c;line-height:1.4;">${title}</div>` +
        (stats ? `<div style="margin-top:3px;font-size:12px;color:#6b7280;line-height:1.5;">${stats}</div>` : '') +
        `</div>`
      );
      continue;
    }
    // 进展标签行
    if (/^(部分)?重点项目.{0,4}进展[：:]\s*$/.test(line.trim())) {
      closeList();
      out.push(
        `<div style="margin:12px 0 8px;font-size:13px;font-weight:bold;color:#0086d4;">▍${line.trim()}</div>`
      );
      continue;
    }
    // 编号条目：1、项目名，进展内容
    const item = line.match(/^(\d+)、(.+)$/);
    if (item) {
      if (!inList) {
        out.push('<div style="display:flex;flex-direction:column;gap:8px;margin:0 0 12px;">');
        inList = true;
      }
      const body = item[2];
      // 项目名加粗：取"项目名（…）"（含全角括号段，如完成率/硬件部分括号），到其后第一个逗号为止；
      // 优先匹配带括号段的形态，避免括号内逗号截断加粗
      const m = body.match(/^(.*?)(（[^）]*）)+[，,]/) || body.match(/^(.*?)[，,]/);
      const name = m ? m[0].slice(0, -1) : null; // 去掉末尾逗号
      const bodyHtml = name ? `<b style="color:#111827;">${name}</b>，${body.slice(name.length + 1)}` : body;
      out.push(
        `<div style="display:flex;gap:10px;align-items:flex-start;">` +
        `<span style="flex-shrink:0;min-width:22px;height:22px;line-height:22px;text-align:center;background:#e8f3fb;color:#0086d4;border-radius:11px;font-size:12px;font-weight:bold;padding:0 6px;">${item[1]}</span>` +
        `<span style="font-size:13px;color:#374151;line-height:1.7;">${bodyHtml}</span>` +
        `</div>`
      );
      continue;
    }
    if (line.trim() === '') { closeList(); continue; }
    closeList();
    out.push(`<p style="margin:0 0 10px;line-height:1.7;font-size:13px;color:#1f2937;">${line}</p>`);
  }
  closeList();
  return out.join('');
}
