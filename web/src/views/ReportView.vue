<template>
  <div>
    <h2>周报管理</h2>


    <div class="card">
      <div class="card-head">
        <div class="tpl-select-row">
          <select v-model="currentId" @change="onSelect" class="tpl-select">
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
          <select v-model="currentPeriod" class="period-select" title="周期类型：决定重点进展汇总最近几个周报期">
            <option v-for="t in ['周报', '双周报', '月报']" :key="t" :value="t">{{ t }}</option>
          </select>
          <label class="attach-check" title="发送邮件时附带「项目进展清单」Excel 附件">
            <input type="checkbox" v-model="currentAttach" /> 附带附件
          </label>
          <button @click="openMailTitle" :disabled="!currentId" title="配置该模板富文本邮件的标题与副标题">标题设置</button>
          <button @click="rename" :disabled="!currentId">重命名</button>
          <button @click="save" :disabled="!currentId">{{ savedTip || '保存' }}</button>
          <button @click="saveAs" :disabled="templates.length >= 5">另存为新模板</button>
          <button class="danger-btn" @click="remove" :disabled="!currentId">删除</button>
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
            rows="10"
            :placeholder="placeholderTip"
            @scroll="syncScroll"
          ></textarea>
        </div>
        <p class="hint">{{ hintText }}</p>
        <div class="report-actions">
          <button :disabled="downloading" @click="downloadAttachment">
            {{ downloading ? '下载中…' : '附件下载' }}
          </button>
          <button class="primary" :disabled="generating || !currentId" @click="generate">
            {{ generating ? '生成中…' : '生成预览' }}
          </button>
        </div>
      </template>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div v-if="generated" ref="resultCard" class="card result-card">
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
      <p class="recipients-line" v-if="recipientsSummary">
        本次收件人（{{ current()?.name || '当前模板' }}）：{{ recipientsSummary }}
      </p>
      <p v-if="previewMode === 'rich'" class="hint">富文本可直接点击编辑，发送/复制以编辑后的内容为准。</p>
      <iframe v-if="previewMode === 'rich'" ref="richFrame" class="rich-preview" :srcdoc="emailSrcdoc" @load="onRichFrameLoad"></iframe>
      <pre v-else class="result">{{ generated }}</pre>
      <p v-if="sendTip" class="ok-tip">{{ sendTip }}</p>
    </div>


    <div class="card mail-card">
      <div class="card-head collapsible" @click="mailOpen = !mailOpen">
        <h3>{{ mailOpen ? '▾' : '▸' }} 邮件发送设置</h3>
        <span class="mail-summary">主送 {{ vipCount('主送') }} · 抄送 {{ vipCount('抄送') }} · 密送 {{ vipCount('密送') }}</span>
      </div>
      <div v-show="mailOpen" class="mail-body">
      <div class="mail-config">
        <label>邮件主题
          <input type="text" v-model="mailSubject" :placeholder="defaultSubject(reportDate)" />
        </label>
        <label>邮件签名
          <textarea v-model="mailSignature" rows="3" placeholder="留空则不附加签名"></textarea>
        </label>
        <p class="toolbar">
          <button @click="saveMailConfig" :disabled="savingConfig">{{ savingConfig ? '保存中…' : '保存主题/签名（当前模板）' }}</button>
          <span v-if="configTip" class="ok-tip">{{ configTip }}</span>
        </p>
      </div>

      <div class="vip-head">
        <h4>VIP 收件人（{{ current()?.name || '当前模板' }}）</h4>
        <div class="toolbar">
          <button class="primary" @click="openVipForm(null)">新增收件人</button>
          <button :disabled="vipImporting" @click="vipFileInput.click()">{{ vipImporting ? '导入中…' : '导入 Excel' }}</button>
          <button @click="exportVip">导出 Excel</button>
          <input ref="vipFileInput" type="file" accept=".xlsx,.xls" hidden @change="onVipImport" />
        </div>
      </div>
      <p class="hint-tip">主题、签名与收件人名单均按当前模板绑定维护；发送方式决定收件人在邮件中的位置（主送/抄送/密送），发送时按「姓名&lt;邮箱&gt;」格式组装；导入格式与导出一致。</p>
      <div v-if="vipImportResult" class="import-result">
        <p class="ok-tip">
          导入完成：新增 {{ vipImportResult.added }} 条，跳过重复 {{ vipImportResult.skipped }} 条，失败 {{ vipImportResult.errors.length }} 条
        </p>
      </div>
      <table class="vip-table">
        <thead>
          <tr><th>部门</th><th>职务</th><th>姓名</th><th>邮箱</th><th>发送方式</th><th>排序</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in recipients" :key="r.id">
            <td>{{ r.dept }}</td>
            <td>{{ r.title }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.email }}</td>
            <td>{{ r.send_type }}</td>
            <td class="ops">
              <button title="上移" :disabled="!canMove(r, -1)" @click="moveVip(r, -1)">↑</button>
              <button title="下移" :disabled="!canMove(r, 1)" @click="moveVip(r, 1)">↓</button>
              <button @click="openVipForm(r)">编辑</button>
              <button @click="removeVip(r)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!recipients.length" class="empty">当前模板暂无 VIP 收件人，请点击「新增收件人」或导入 Excel。</p>

      <div v-if="weeklyLogs.length" class="log-block">
        <h4>发送记录</h4>
        <table class="vip-table">
          <thead>
            <tr><th>时间</th><th>主题</th><th>主送</th><th>抄送</th><th>密送</th><th>附件</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="l in weeklyLogs" :key="l.id">
              <td class="num">{{ l.created_at }}</td>
              <td>{{ l.subject }}</td>
              <td class="addr-cell">{{ l.to_addr || '—' }}</td>
              <td class="addr-cell">{{ l.cc_addr || '—' }}</td>
              <td class="addr-cell">{{ l.bcc_addr || '—' }}</td>
              <td>{{ l.attachment || '—' }}</td>
              <td>{{ l.status }}<span v-if="l.error" class="error">（{{ l.error }}）</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>

    <div v-if="mailTitleOpen" class="modal">
      <div class="dialog">
        <h3>邮件标题设置（{{ current()?.name || '当前模板' }}）</h3>
        <label>标题
          <input type="text" v-model="mailTitleDraft" placeholder="留空用默认：省本部重点工程项目进展" />
        </label>
        <label>副标题
          <input type="text" v-model="mailSubtitleDraft" placeholder="留空用系统日期" />
        </label>
        <p class="hint-tip">配置只影响富文本邮件页头（标题条），与邮件主题相互独立。</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="dialog-actions">
          <button class="primary" @click="saveMailTitle">保存</button>
          <button @click="mailTitleOpen = false">取消</button>
        </div>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { api } from '../api.js';
import { exportAttachment, buildAttachmentBase64, systemDate } from '../exportExcel.js';
import { buildEmailShell, signatureHtml, defaultSubject, renderWeeklyBodyHtml } from '../weeklyMail.js';

const templates = ref([]);
const currentId = ref(null);
const template = ref('');
const currentPeriod = ref('周报'); // 周报 / 双周报 / 月报：决定重点进展汇总的时间窗口
const currentAttach = ref(false); // 发送时是否附带项目进展清单 Excel
const currentMailTitle = ref(''); // 富文本邮件标题（留空用默认）
const currentMailSubtitle = ref(''); // 富文本邮件副标题（留空用系统日期）
// 标题设置弹窗
const mailTitleOpen = ref(false);
const mailTitleDraft = ref('');
const mailSubtitleDraft = ref('');

function openMailTitle() {
  mailTitleDraft.value = currentMailTitle.value;
  mailSubtitleDraft.value = currentMailSubtitle.value;
  mailTitleOpen.value = true;
}

async function saveMailTitle() {
  error.value = '';
  try {
    await api.updateReportTemplate(
      currentId.value, current().name, template.value, currentPeriod.value,
      currentAttach.value, mailTitleDraft.value, mailSubtitleDraft.value
    );
    currentMailTitle.value = mailTitleDraft.value;
    currentMailSubtitle.value = mailSubtitleDraft.value;
    mailTitleOpen.value = false;
    await load(false);
  } catch (e) {
    error.value = e.message;
  }
}
const generated = ref('');
const generating = ref(false);
const downloading = ref(false);
const error = ref('');
const savedTip = ref('');
const copyTip = ref('');
const emailCopyTip = ref('');

// 邮件发送：预览模式 / 主题签名配置 / VIP 收件人 / 发送
const previewMode = ref('rich');
const resultCard = ref(null);
// 发送设置默认折叠（低频操作），头部展示收件人摘要
const mailOpen = ref(false);
const richFrame = ref(null);
// 用户在富文本里的直接编辑结果（null 表示未编辑，用生成值）
const editedHtml = ref(null);
const mailSubject = ref(''); // 邮件主题（按模板绑定，留空用默认）
const mailSignature = ref(''); // 邮件签名（按模板绑定）
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
  '可用占位符：{{项目总数}} {{在建项目总数}}（剔除终验归档阶段）{{近1周交付项目数}} {{近2周交付项目数}}（按阶段变更为终验归档的时间统计）{{拟取消数}}；每个分类（收入相关/基础能力/支撑后端）支持 {{分类名_项目数}} {{分类名_占比}} {{分类名_金额亿}} {{分类名_重点进展}}，以及按阶段统计的 {{分类名_阶段名_项目数}}（如 {{基础能力_勘察设计阶段_项目数}}，阶段名取自项目基础信息，无对应项目时替换为 0）；以上均提供在建变体：{{分类名_在建_项目数}} {{分类名_在建_占比}}（占在建总数比，含拟取消，与「在建项目总数」同口径）{{分类名_在建_金额亿}} {{分类名_在建_阶段名_项目数}}（剔除终验归档）。模板可选周期类型（周报/双周报/月报），重点进展按最近 1/2/4 个周报期自动合并。模板最多保存 5 个。';

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
  currentPeriod.value = current()?.period_type ?? '周报';
  currentAttach.value = !!current()?.with_attachment;
  currentMailTitle.value = current()?.mail_title ?? '';
  currentMailSubtitle.value = current()?.mail_subtitle ?? '';
  mailSubject.value = current()?.mail_subject ?? '';
  mailSignature.value = current()?.mail_signature ?? '';
  // 发送记录也随模板切换
  loadWeeklyLogs();
  generated.value = '';
  // 切换模板 → 载入该模板独立的 VIP 收件人名单
  if (currentId.value) loadVip();
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
    await api.updateReportTemplate(currentId.value, current().name, template.value, currentPeriod.value, currentAttach.value, currentMailTitle.value, currentMailSubtitle.value);
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
    await api.updateReportTemplate(currentId.value, name.trim(), template.value, currentPeriod.value, currentAttach.value, currentMailTitle.value, currentMailSubtitle.value);
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
    const r = await api.createReportTemplate(name.trim(), template.value, currentPeriod.value, currentAttach.value, currentMailTitle.value, currentMailSubtitle.value);
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
    await api.updateReportTemplate(currentId.value, current().name, template.value, currentPeriod.value, currentAttach.value, currentMailTitle.value, currentMailSubtitle.value);
    generated.value = (await api.getReportPreview(currentId.value)).text;
    // 生成后自动滚动到结果区
    await nextTick();
    resultCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  return buildEmailShell(body + signatureHtml(mailSignature.value), {
    title: currentMailTitle.value,
    subtitle: currentMailSubtitle.value || systemDate(),
  });
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

// 收件人展示：姓名<邮箱>
function addrText(r) {
  return `${r.name}<${r.email}>`;
}
function groupAddrs(type) {
  return recipients.value.filter((r) => r.send_type === type).map(addrText);
}
function vipCount(type) {
  return recipients.value.filter((r) => r.send_type === type).length;
}
// 结果卡上的本次收件人摘要
const recipientsSummary = computed(() => {
  const to = groupAddrs('主送');
  const cc = groupAddrs('抄送');
  const bcc = groupAddrs('密送');
  if (!to.length && !cc.length && !bcc.length) return '';
  const parts = [];
  if (to.length) parts.push(`主送 ${to.join('、')}`);
  if (cc.length) parts.push(`抄送 ${cc.join('、')}`);
  if (bcc.length) parts.push(`密送 ${bcc.join('、')}`);
  return parts.join('；');
});

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
    weeklyLogs.value = (await api.getWeeklyMailLogs(currentId.value)).logs;
  } catch {
    // 记录加载失败不影响主流程
  }
}

async function sendMail() {
  if (!generated.value) {
    window.alert('请先生成预览');
    return;
  }
  const to = groupAddrs('主送');
  const cc = groupAddrs('抄送');
  const bcc = groupAddrs('密送');
  const line = (label, list) => `${label}：${list.length ? list.join('、') : '（无）'}`;
  if (!window.confirm(
    `确认发送周报邮件？\n模板：${current()?.name || ''}\n主题：${mailSubject.value.trim() || defaultSubject(reportDate.value)}\n` +
    `${line('主送', to)}\n${line('抄送', cc)}\n${line('密送', bcc)}`
  )) return;
  sending.value = true;
  sendTip.value = '';
  try {
    // 模板开启"附带附件" → 生成与「附件下载」相同的 Excel 随邮件发出
    let attachment = null;
    if (currentAttach.value) {
      const res = await api.getReports({});
      if (!res.reportDate) {
        sendTip.value = '模板开启了附带附件，但暂无周报数据可生成附件，已取消发送';
        sending.value = false;
        return;
      }
      attachment = await buildAttachmentBase64(res.rows, res.reportDate);
    }
    const res = await api.sendWeeklyMail({
      templateId: currentId.value,
      subject: mailSubject.value.trim() || defaultSubject(reportDate.value),
      html: currentEmailHtml.value,
      text: generated.value,
      attachment,
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

// 主题/签名随当前模板保存（数据库按模板绑定）
async function saveMailConfig() {
  savingConfig.value = true;
  configTip.value = '';
  try {
    await api.updateReportTemplate(
      currentId.value, current().name, template.value, currentPeriod.value,
      currentAttach.value, currentMailTitle.value, currentMailSubtitle.value,
      mailSubject.value, mailSignature.value
    );
    await load(false);
    configTip.value = '已保存到当前模板';
    setTimeout(() => { configTip.value = ''; }, 2000);
  } catch (e) {
    error.value = e.message;
  } finally {
    savingConfig.value = false;
  }
}

async function loadVip() {
  try {
    recipients.value = (await api.listVipRecipients(currentId.value)).recipients;
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
    if (id) await api.updateVipRecipient(currentId.value, id, body);
    else await api.createVipRecipient(currentId.value, body);
    vipEditing.value = null;
    await loadVip();
  } catch (e) {
    vipFormError.value = e.message;
  }
}

async function removeVip(r) {
  if (!window.confirm(`确认删除 VIP 收件人「${r.name}」？`)) return;
  try {
    await api.deleteVipRecipient(currentId.value, r.id);
    await loadVip();
  } catch (e) {
    error.value = e.message;
  }
}

// 同一发送方式组内可移动（组间顺序固定：主送→抄送→密送）
function canMove(r, dir) {
  const group = recipients.value.filter((x) => x.send_type === r.send_type);
  const idx = group.findIndex((x) => x.id === r.id);
  return idx >= 0 && idx + dir >= 0 && idx + dir < group.length;
}

async function moveVip(r, dir) {
  if (!canMove(r, dir)) return;
  const group = recipients.value.filter((x) => x.send_type === r.send_type);
  const idx = group.findIndex((x) => x.id === r.id);
  // 全量 id 顺序中交换相邻两项
  const ids = recipients.value.map((x) => x.id);
  const a = recipients.value.indexOf(r);
  const b = recipients.value.indexOf(group[idx + dir]);
  [ids[a], ids[b]] = [ids[b], ids[a]];
  // 乐观更新，失败回滚
  const before = [...recipients.value];
  [recipients.value[a], recipients.value[b]] = [recipients.value[b], recipients.value[a]];
  try {
    await api.saveVipOrder(currentId.value, ids);
  } catch (e) {
    recipients.value = before;
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
    vipImportResult.value = await api.importVipRecipients(currentId.value, file);
    await loadVip();
  } catch (err) {
    error.value = err.message;
  } finally {
    vipImporting.value = false;
  }
}

function exportVip() {
  const a = document.createElement('a');
  a.href = `/api/vip-recipients/export?template_id=${currentId.value}`;
  a.download = 'vip_recipients.xlsx';
  a.click();
}

onMounted(async () => {
  try {
    await load();
    // 周报日期（外壳日期/默认主题用）：取最近一次周报导入日期
    const dates = await api.getReportDates();
    reportDate.value = dates.dates?.[0] ?? '';
    await Promise.all([loadVip(), loadWeeklyLogs()]);
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.card { margin-bottom: 24px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.tpl-select-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.period-select { padding: 6px 10px; border: 1px solid var(--hairline); border-radius: var(--r-sm); font-size: 14px; }
.attach-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--ink-secondary);
  cursor: pointer;
}
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
.addr-cell {
  font-size: 12px;
  color: var(--ink-secondary);
  text-align: left !important;
  word-break: break-all;
  max-width: 260px;
}
/* 结果卡的本次收件人摘要 */
.recipients-line {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--ink-secondary);
  background: var(--canvas-soft, #f5f6f8);
  border-radius: var(--r-md);
  padding: 8px 12px;
  line-height: 1.6;
}
/* 发送设置折叠头 */
.collapsible { cursor: pointer; user-select: none; }
.collapsible h3:hover { color: var(--primary); }
.mail-summary { font-size: 13px; color: var(--ink-mute); }
.mail-body { display: flex; flex-direction: column; }

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
