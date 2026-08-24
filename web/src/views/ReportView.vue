<template>
  <div>
    <h2>生成周报</h2>

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
        <button class="primary" :disabled="generating || !currentId" @click="generate">
          {{ generating ? '生成中…' : '生成预览' }}
        </button>
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
          <button @click="copy">{{ copyTip || '复制纯文本' }}</button>
          <button @click="copyAsEmail">{{ emailCopyTip || '复制邮件格式' }}</button>
        </div>
      </div>
      <pre class="result">{{ generated }}</pre>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

const templates = ref([]);
const currentId = ref(null);
const template = ref('');
const generated = ref('');
const generating = ref(false);
const error = ref('');
const savedTip = ref('');
const copyTip = ref('');
const emailCopyTip = ref('');

const placeholderTip =
  '在此粘贴模板，使用 {{项目总数}}、{{拟取消数}}、{{收入相关_项目数}}、{{收入相关_占比}}、{{收入相关_金额亿}}、{{收入相关_重点进展}} 等占位符';
const hintText =
  '可用占位符：{{项目总数}} {{拟取消数}}；每个分类（收入相关/基础能力/支撑后端）支持 {{分类名_项目数}} {{分类名_占比}} {{分类名_金额亿}} {{分类名_重点进展}}。模板最多保存 5 个。';

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

async function copy() {
  try {
    await navigator.clipboard.writeText(generated.value);
    copyTip.value = '已复制';
    setTimeout(() => { copyTip.value = ''; }, 2000);
  } catch {
    copyTip.value = '复制失败，请手动选择';
  }
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const generatedEmailHtml = computed(() => {
  if (!generated.value) return '';
  const lines = escapeHtml(generated.value).split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const heading = line.match(/^([一二三四五六七八九十]+、)(.*)$/);
    const item = line.match(/^(\d+、)(.*)$/);
    if (heading) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3 style="margin:14px 0 6px 0;font-size:12pt;color:#000;font-weight:bold;">${heading[1]}${heading[2]}</h3>`);
    } else if (item) {
      if (!inList) { out.push('<ul style="margin:0 0 8px 20px;padding:0;">'); inList = true; }
      out.push(`<li style="margin-bottom:4px;line-height:1.6;font-size:12pt;color:#000;">${item[2]}</li>`);
    } else if (line.trim() === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<br>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p style="margin:0 0 8px 0;line-height:1.6;font-size:12pt;color:#000;">${line}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return `<div style="font-family:宋体,SimSun,sans-serif;font-size:12pt;color:#000;">${out.join('')}</div>`;
});

async function copyAsEmail() {
  try {
    const html = generatedEmailHtml.value;
    const plain = generated.value;
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
    emailCopyTip.value = '已复制邮件格式';
  } catch {
    // 不支持 ClipboardItem 时回退到纯文本
    try {
      await navigator.clipboard.writeText(generated.value);
      emailCopyTip.value = '已复制纯文本';
    } catch {
      emailCopyTip.value = '复制失败';
      return;
    }
  }
  setTimeout(() => { emailCopyTip.value = ''; }, 2000);
}

onMounted(async () => {
  try {
    await load();
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
.result-actions { display: flex; gap: 12px; }
</style>
