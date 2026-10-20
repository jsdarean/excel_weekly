<template>
  <div>
    <h2>周报管理</h2>

    <div class="card">
      <div class="card-head">
        <div class="tpl-select-row">
          <select v-model="currentId" @change="onSelect" class="tpl-select">
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <button @click="rename" :disabled="!currentId">重命名</button>
          <button @click="save" :disabled="!currentId">{{ savedTip || '保存' }}</button>
          <button @click="saveAs" :disabled="templates.length >= 5">另存为新模板</button>
          <button class="danger-btn" @click="remove" :disabled="!currentId">删除</button>
        </div>
        <div class="report-actions">
          <button :disabled="downloading" @click="downloadAttachment">
            {{ downloading ? '下载中…' : '附件下载' }}
          </button>
          <button class="primary" :disabled="generating || !currentId" @click="generate">
            {{ generating ? '生成中…' : '生成预览' }}
          </button>
        </div>
      </div>

      <div v-if="!templates.length" class="empty-box">
        <p class="empty">还没有模板，点击下方按钮创建第一个模板。</p>
        <button class="primary" @click="saveAs">新建模板</button>
      </div>

      <template v-else>
        <div class="tpl-editor">
          <pre class="tpl-highlight" ref="hl" v-html="highlighted"></pre>
          <textarea
            ref="ta"
            v-model="template"
            class="tpl-input"
            rows="14"
            :placeholder="placeholderTip"
            @scroll="syncScroll"
          ></textarea>
        </div>
        <p class="hint">{{ hintText }}</p>
      </template>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div v-if="generated" class="card result-card">
      <div class="card-head">
        <h3>生成结果</h3>
        <div class="result-actions">
          <button class="mode-btn" :class="{ active: previewMode === 'rich' }" @click="previewMode = 'rich'">富文本</button>
          <button class="mode-btn" :class="{ active: previewMode === 'plain' }" @click="previewMode = 'plain'">纯文本</button>
          <button @click="copy">{{ copyTip || '复制纯文本' }}</button>
          <button @click="copyAsEmail">{{ emailCopyTip || '复制邮件格式' }}</button>
          <button class="primary" :disabled="sending" @click="sendMail">
            {{ sending ? '发送中…' : '一键发送' }}
          </button>
        </div>
      </div>
      <p v-if="previewMode === 'rich'" class="hint">富文本可直接点击编辑，发送/复制以编辑后的内容为准。</p>
      <iframe v-if="previewMode === 'rich'" ref="richFrame" class="rich-preview" :srcdoc="emailSrcdoc" @load="onRichFrameLoad"></iframe>
      <pre v-else class="result">{{ generated }}</pre>
      <p v-if="sendTip" class="ok-tip">{{ sendTip }}</p>
    </div>

    <div class="card mail-card">
      <div class="card-head">
        <h3>邮件发送设置</h3>
      </div>
      <div class="mail-config">
        <label>邮件主题
          <input type="text" v-model="mailSubject" :placeholder="defaultSubject(reportDate)" />
        </label>
        <label>邮件签名
          <textarea v-model="mailSignature" rows="3" placeholder="留空则不附加签名"></textarea>
        </label>
        <p class="toolbar">
          <button @click="saveMailConfig" :disabled="savingConfig">{{ savingConfig ? '保存中…' : '保存主题/签名' }}</button>
          <span v-if="configTip" class="ok-tip">{{ configTip }}</span>
        </p>
      </div>

      <div class="vip-head">
        <h4>VIP 收件人</h4>
        <div class="toolbar">
          <button class="primary" @click="openVipForm(null)">新增收件人</button>
          <button :disabled="vipImporting" @click="vipFileInput.click()">{{ vipImporting ? '导入中…' : '导入 Excel' }}</button>
          <button @click="exportVip">导出 Excel</button>
          <input ref="vipFileInput" type="file" accept=".xlsx,.xls" hidden @change="onVipImport" />
        </div>
      </div>
      <p class="hint-tip">发送方式决定收件人在邮件中的位置（主送/抄送/密送），发送时按「姓名&lt;邮箱&gt;」格式组装；导入格式与导出一致。</p>
      <div v-if="vipImportResult" class="import-result">
        <p class="ok-tip">
          导入完成：新增 {{ vipImportResult.added }} 条，跳过重复 {{ vipImportResult.skipped }} 条，失败 {{ vipImportResult.errors.length }} 条
        </p>
      </div>
      <table class="vip-table">
        <thead>
          <tr><th>部门</th><th>职务</th><th>姓名</th><th>邮箱</th><th>发送方式</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in recipients" :key="r.id">
            <td>{{ r.dept }}</td>
            <td>{{ r.title }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.email }}</td>
            <td>{{ r.send_type }}</td>
            <td class="ops">
              <button @click="openVipForm(r)">编辑</button>
              <button @click="removeVip(r)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!recipients.length" class="empty">暂无 VIP 收件人，请点击「新增收件人」或导入 Excel。</p>

      <div v-if="weeklyLogs.length" class="log-block">
        <h4>发送记录</h4>
        <table class="vip-table">
          <thead>
            <tr><th>时间</th><th>主题</th><th>主送</th><th>抄送</th><th>密送</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in weeklyLogs" :key="l.id">
              <td class="num">{{ l.created_at }}</td>
              <td>{{ l.subject }}</td>
              <td class="num">{{ countAddr(l.to_addr) }}</td>
              <td class="num">{{ countAddr(l.cc_addr) }}</td>
              <td class="num">{{ countAddr(l.bcc_addr) }}</td>
              <td>{{ l.status }}<span v-if="l.error" class="error">（{{ l.error }}）</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="vipEditing" class="modal">
      <div class="dialog">
        <h3>{{ vipEditing.id ? '编辑收件人' : '新增收件人' }}</h3>
        <label>部门 <input type="text" v-model="vipEditing.dept" /></label>
        <label>职务 <input type="text" v-model="vipEditing.title" /></label>
        <label>姓名 <input type="text" v-model="vipEditing.name" /></label>
        <label>邮箱 <input type="email" v-model="vipEditing.email" /></label>
        <label>发送方式
          <select v-model="vipEditing.sendType">
            <option v-for="t in ['主送', '抄送', '密送']" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <p v-if="vipFormError" class="error">{{ vipFormError }}</p>
        <div class="dialog-actions">
          <button class="primary" @click="saveVip">保存</button>
          <button @click="vipEditing = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api.js';
import { exportAttachment } from '../exportExcel.js';
import { buildEmailShell, signatureHtml, defaultSubject, renderWeeklyBodyHtml } from '../weeklyMail.js';

const templates = ref([]);
const currentId = ref(null);
const template = ref('');
const generated = ref('');
const generating = ref(false);
const downloading = ref(false);
const error = ref('');
const savedTip = ref('');
const copyTip = ref('');
const emailCopyTip = ref('');

// 邮件发送：预览模式 / 主题签名配置 / VIP 收件人 / 发送
const previewMode = ref('rich');
const richFrame = ref(null);
// 用户在富文本里的直接编辑结果（null 表示未编辑，用生成值）
const editedHtml = ref(null);
const mailSubject = ref('');
const mailSignature = ref('');
const savingConfig = ref(false);
const configTip = ref('');
const reportDate = ref('');
const recipients = ref([]);
const vipEditing = ref(null);
const vipFormError = ref('');
const vipFileInput = ref(null);
const vipImporting = ref(false);
const vipImportResult = ref(null);
const sending = ref(false);
const sendTip = ref('');
const weeklyLogs = ref([]);

const placeholderTip =
  '在此粘贴模板，使用 {{项目总数}}、{{在建项目总数}}、{{近1周交付项目数}}、{{近2周交付项目数}}、{{拟取消数}}、{{收入相关_项目数}}、{{收入相关_占比}}、{{收入相关_金额亿}}、{{收入相关_重点进展}}、{{收入相关_项目实施阶段_项目数}} 等占位符';
const hintText =
  '可用占位符：{{项目总数}} {{在建项目总数}}（剔除终验归档阶段与拟取消类别）{{近1周交付项目数}} {{近2周交付项目数}}（按阶段变更为终验归档的时间统计）{{拟取消数}}；每个分类（收入相关/基础能力/支撑后端）支持 {{分类名_项目数}} {{分类名_占比}} {{分类名_金额亿}} {{分类名_重点进展}}，以及按阶段统计的 {{分类名_阶段名_项目数}}（如 {{基础能力_勘察设计阶段_项目数}}，阶段名取自项目基础信息，无对应项目时替换为 0）。模板最多保存 5 个。';

// 模板高亮：底层 pre 把 {{占位符}} 标红，上层 textarea 文字透明（光标可见）
const ta = ref(null);
const hl = ref(null);

const highlighted = computed(() => {
  const esc = template.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\{\{[^}]*\}\}/g, '<span class="ph">$&</span>') + '\n';
});

function syncScroll() {
  if (hl.value && ta.value) {
    hl.value.scrollTop = ta.value.scrollTop;
    hl.value.scrollLeft = ta.value.scrollLeft;
  }
}

function current() {
  return templates.value.find((t) => t.id === currentId.value);
}

function onSelect() {
  template.value = current()?.content ?? '';
  generated.value = '';
}

async function load(selectFirst = true) {
  const res = await api.getReportTemplates();
  templates.value = res.templates;
  if (selectFirst && res.templates.length && !currentId.value) {
    currentId.value = res.templates[0].id;
  }
  if (currentId.value && !current()) {
    currentId.value = res.templates[0]?.id ?? null;
  }
  onSelect();
}

async function save() {
  error.value = '';
  try {
    await api.updateReportTemplate(currentId.value, current().name, template.value);
    savedTip.value = '已保存';
    setTimeout(() => { savedTip.value = ''; }, 2000);
    await load(false);
  } catch (e) {
    error.value = e.message;
  }
}

async function rename() {
  const name = window.prompt('模板名称：', current()?.name ?? '');
  if (name === null) return;
  if (!name.trim()) {
    error.value = '模板名称不能为空';
    return;
  }
  error.value = '';
  try {
    await api.updateReportTemplate(currentId.value, name.trim(), template.value);
    await load(false);
  } catch (e) {
    error.value = e.message;
  }
}

async function saveAs() {
  const name = window.prompt('新模板名称：', `模板${templates.value.length + 1}`);
  if (name === null) return;
  if (!name.trim()) {
    error.value = '模板名称不能为空';
    return;
  }
  error.value = '';
  try {
    const r = await api.createReportTemplate(name.trim(), template.value);
    await load(false);
    currentId.value = r.id;
    onSelect();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove() {
  if (!window.confirm(`确认删除模板「${current()?.name}」？`)) return;
  error.value = '';
  try {
    await api.deleteReportTemplate(currentId.value);
    currentId.value = null;
    generated.value = '';
    await load(false);
  } catch (e) {
    error.value = e.message;
  }
}

async function generate() {
  generating.value = true;
  error.value = '';
  try {
    // 先保存再生成，保证预览用的是当前编辑内容
    await api.updateReportTemplate(currentId.value, current().name, template.value);
    generated.value = (await api.getReportPreview(currentId.value)).text;
  } catch (e) {
    error.value = e.message;
  } finally {
    generating.value = false;
  }
}

async function downloadAttachment() {
  downloading.value = true;
  error.value = '';
  try {
    const res = await api.getReports({});
    if (!res.reportDate) {
      error.value = '暂无周报数据，请先到「数据导入」页导入。';
      return;
    }
    await exportAttachment(res.rows, res.reportDate);
  } catch (e) {
    error.value = `附件下载失败：${e.message}`;
  } finally {
    downloading.value = false;
  }
}

// ===== 剪贴板降级工具 =====
// navigator.clipboard 仅在安全上下文（HTTPS / localhost）下存在；
// 外网 HTTP 访问时为 undefined，必须用 document.execCommand('copy') 兜底。

// 纯文本复制（HTTP 兼容）
function copyPlainText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

// 富文本复制（text/html + text/plain 双格式，HTTP 兼容）：
// 选中一个临时 contenteditable 节点，在用户手势内用 copy 事件覆盖写入两种 MIME 格式
function copyRichText(html, plain) {
  const container = document.createElement('div');
  container.contentEditable = 'true';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.opacity = '0';
  container.innerHTML = html;
  document.body.appendChild(container);
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(container);
  sel.addRange(range);
  const onCopy = (e) => {
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', plain);
    e.preventDefault();
  };
  document.addEventListener('copy', onCopy);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.removeEventListener('copy', onCopy);
  sel.removeAllRanges();
  document.body.removeChild(container);
  return ok;
}

async function copy() {
  const text = generated.value;
  let ok = false;
  try {
    // 安全上下文优先 Clipboard API；HTTP 环境（该 API 不存在）走 execCommand 降级
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch { /* 降级到 execCommand */ }
  if (!ok) ok = copyPlainText(text);
  copyTip.value = ok ? '已复制' : '复制失败，请手动选择';
  if (ok) setTimeout(() => { copyTip.value = ''; }, 2000);
}

const generatedEmailHtml = computed(() => {
  if (!generated.value) return '';
  const body = `<div style="font-family:'Microsoft YaHei','PingFang SC',宋体,sans-serif;">${renderWeeklyBodyHtml(generated.value)}</div>`;
  // 商务外壳（标题条+日期）+ 正文 + 签名，与发送出去的邮件一致
  return buildEmailShell(body + signatureHtml(mailSignature.value), { date: reportDate.value });
});

// 富文本 iframe：contenteditable 可直接编辑，编辑内容实时同步到 editedHtml
const emailSrcdoc = computed(() =>
  generatedEmailHtml.value
    ? `<!DOCTYPE html><html><body contenteditable="true" style="margin:0;padding:24px;background:#f3f4f6;">${generatedEmailHtml.value}</body></html>`
    : ''
);
function onRichFrameLoad() {
  const doc = richFrame.value?.contentDocument;
  if (!doc) return;
  doc.addEventListener('input', () => {
    editedHtml.value = doc.body.innerHTML;
  });
}
// 重新生成/签名/日期变化 → 丢弃旧编辑，以新内容为准
watch(generatedEmailHtml, () => { editedHtml.value = null; });
// 发送/复制统一取编辑后的内容（未编辑时用生成值）
const currentEmailHtml = computed(() => editedHtml.value ?? generatedEmailHtml.value);

async function copyAsEmail() {
  const html = currentEmailHtml.value;
  const plain = generated.value;
  let copied = '';
  try {
    // 安全上下文：Clipboard API 写入 HTML + 纯文本双格式
    if (navigator.clipboard && window.isSecureContext && typeof ClipboardItem === 'function') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      copied = '已复制邮件格式';
    }
  } catch { /* API 异常，继续降级 */ }
  // HTTP 环境：execCommand 富文本降级（仍是邮件格式）；再不行退纯文本
  if (!copied && copyRichText(html, plain)) copied = '已复制邮件格式';
  if (!copied && copyPlainText(plain)) copied = '已复制纯文本';
  emailCopyTip.value = copied || '复制失败';
  if (copied) setTimeout(() => { emailCopyTip.value = ''; }, 2000);
}

async function loadWeeklyLogs() {
  try {
    weeklyLogs.value = (await api.getWeeklyMailLogs()).logs;
  } catch {
    // 记录加载失败不影响主流程
  }
}

async function sendMail() {
  if (!generated.value) {
    window.alert('请先生成预览');
    return;
  }
  const to = recipients.value.filter((r) => r.send_type === '主送');
  const cc = recipients.value.filter((r) => r.send_type === '抄送');
  const bcc = recipients.value.filter((r) => r.send_type === '密送');
  if (!window.confirm(
    `确认发送周报邮件？\n主题：${mailSubject.value.trim() || defaultSubject(reportDate.value)}\n主送 ${to.length} 人，抄送 ${cc.length} 人，密送 ${bcc.length} 人`
  )) return;
  sending.value = true;
  sendTip.value = '';
  try {
    const res = await api.sendWeeklyMail({
      subject: mailSubject.value.trim() || defaultSubject(reportDate.value),
      html: currentEmailHtml.value,
      text: generated.value,
    });
    sendTip.value = res.message || '发送成功';
  } catch (e) {
    sendTip.value = e.message;
  } finally {
    sending.value = false;
    await loadWeeklyLogs();
  }
}

// ===== 邮件发送设置 =====

async function loadMailConfig() {
  try {
    const c = await api.getWeeklyMailConfig();
    mailSubject.value = c.subject ?? '';
    mailSignature.value = c.signature ?? '';
  } catch {
    // 配置加载失败不影响主流程
  }
}

async function saveMailConfig() {
  savingConfig.value = true;
  configTip.value = '';
  try {
    await api.saveWeeklyMailConfig({ subject: mailSubject.value, signature: mailSignature.value });
    configTip.value = '已保存';
    setTimeout(() => { configTip.value = ''; }, 2000);
  } catch (e) {
    error.value = e.message;
  } finally {
    savingConfig.value = false;
  }
}

async function loadVip() {
  try {
    recipients.value = (await api.listVipRecipients()).recipients;
  } catch (e) {
    error.value = e.message;
  }
}

function openVipForm(r) {
  vipFormError.value = '';
  vipEditing.value = r
    ? { id: r.id, dept: r.dept ?? '', title: r.title ?? '', name: r.name, email: r.email, sendType: r.send_type }
    : { id: null, dept: '', title: '', name: '', email: '', sendType: '主送' };
}

async function saveVip() {
  vipFormError.value = '';
  try {
    const { id, ...body } = vipEditing.value;
    if (id) await api.updateVipRecipient(id, body);
    else await api.createVipRecipient(body);
    vipEditing.value = null;
    await loadVip();
  } catch (e) {
    vipFormError.value = e.message;
  }
}

async function removeVip(r) {
  if (!window.confirm(`确认删除 VIP 收件人「${r.name}」？`)) return;
  try {
    await api.deleteVipRecipient(r.id);
    await loadVip();
  } catch (e) {
    error.value = e.message;
  }
}

async function onVipImport(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  vipImporting.value = true;
  vipImportResult.value = null;
  try {
    vipImportResult.value = await api.importVipRecipients(file);
    await loadVip();
  } catch (err) {
    error.value = err.message;
  } finally {
    vipImporting.value = false;
  }
}

function exportVip() {
  const a = document.createElement('a');
  a.href = '/api/vip-recipients/export';
  a.download = 'vip_recipients.xlsx';
  a.click();
}

// 发送记录中的地址串（顿号分隔）统计人数
function countAddr(s) {
  return s ? String(s).split('、').filter(Boolean).length : 0;
}

onMounted(async () => {
  try {
    await load();
    // 周报日期（外壳日期/默认主题用）：取最近一次周报导入日期
    const dates = await api.getReportDates();
    reportDate.value = dates.dates?.[0] ?? '';
    await Promise.all([loadMailConfig(), loadVip(), loadWeeklyLogs()]);
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.card { margin-bottom: 24px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.tpl-select-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tpl-select { min-width: 160px; }
.danger-btn { border-color: var(--ruby); color: var(--ruby); }
.danger-btn:hover { background: #fdf0f4; }
.empty-box { text-align: center; padding: 32px 0; }
.empty { color: var(--ink-mute); }

.tpl-editor { position: relative; }
.tpl-highlight,
.tpl-input {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}
.tpl-highlight {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--ink);
  border: 1px solid transparent;
  pointer-events: none;
}
.tpl-highlight :deep(.ph) { color: var(--ruby); font-weight: 400; }
.tpl-input {
  width: 100%;
  box-sizing: border-box;
  position: relative;
  background: transparent;
  color: transparent;
  caret-color: var(--ink);
  resize: none;
  border: 1px solid var(--hairline-input);
  border-radius: var(--r-sm);
}
.tpl-input:focus { outline: none; border-color: var(--primary); }
.tpl-input::placeholder { color: var(--ink-mute); }

.hint { font-size: 12px; color: var(--ink-mute); margin: 8px 0 0; }
.result {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  margin: 0;
}
.result-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.report-actions { display: flex; align-items: center; gap: 12px; }

/* 富文本预览：iframe 隔离邮件样式 */
.rich-preview {
  width: 100%;
  min-height: 480px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: #f3f4f6;
}
.mode-btn { opacity: 0.6; }
.mode-btn.active { opacity: 1; border-color: var(--primary); color: var(--primary); }
.ok-tip { font-size: 13px; color: #16a34a; margin: 8px 0 0; }

/* 邮件发送设置 */
.mail-config { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.mail-config label {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.mail-config label input,
.mail-config label textarea { flex: 1; }
.vip-head { display: flex; align-items: center; justify-content: space-between; margin: 8px 0 4px; }
.vip-head h4, .log-block h4 { margin: 0; font-size: 15px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin: 0; }
.hint-tip { font-size: 12px; color: var(--ink-mute); margin: 4px 0 12px; }
.vip-table { width: 100%; margin-bottom: 8px; }
.vip-table th, .vip-table td { text-align: center; }
.ops { display: flex; gap: 8px; justify-content: center; }
.empty { text-align: center; color: var(--ink-mute); font-size: 14px; padding: 12px 0; }
.log-block { margin-top: 20px; }
.log-block h4 { margin-bottom: 10px; }

.modal {
  position: fixed;
  inset: 0;
  background: rgba(13, 37, 61, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialog {
  background: var(--canvas);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 360px;
}
.dialog label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.dialog label input,
.dialog label select { flex: 1; }
.dialog-actions { display: flex; gap: 12px; margin-top: 8px; }
</style>
