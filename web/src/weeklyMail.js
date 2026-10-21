// 周报邮件：商务外壳 / 默认主题 / 签名渲染（纯逻辑，便于测试）

// 外壳标题与默认主题前缀
export const WEEKLY_MAIL_TITLE = '省本部重点工程项目进展';

// 默认主题：省本部重点项目进展（周五日期）
export function defaultSubject(reportDate) {
  return `${WEEKLY_MAIL_TITLE}（${reportDate}）`;
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
        `<div style="margin:18px 0 10px;padding-left:10px;border-left:4px solid #0086d4;">` +
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
      const m = body.match(/^([^，,]+)[，,]/);
      const bodyHtml = m ? `<b style="color:#111827;">${m[1]}</b>，${body.slice(m[1].length + 1)}` : body;
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
