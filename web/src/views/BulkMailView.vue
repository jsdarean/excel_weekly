<template>
  <div>
    <h2>批量邮件</h2>
    <p v-if="error" class="error">{{ error }}</p>

    <!-- 邮件模板配置 -->
    <div class="card form-card">
      <h3>邮件模板配置</h3>
      <label>邮件主题
        <input type="text" v-model="tpl.subject" />
      </label>
      <label>邮件正文
        <textarea v-model="tpl.body" rows="10"></textarea>
      </label>
      <label>邮件签名
        <textarea v-model="tpl.signature" rows="4"></textarea>
      </label>
      <p class="hint">
        可用占位符（主题/正文/签名均支持）：{{ placeholders }}
      </p>
      <div class="actions">
        <button class="primary" :disabled="savingTpl" @click="saveTpl">{{ savingTpl ? '保存中…' : (tplSavedTip || '保存模板') }}</button>
      </div>
    </div>

    <!-- 可发送项目列表 -->
    <div class="card">
      <h3>待发送项目（按项目一封，主送/抄送/密送自动分组）</h3>
      <p v-if="!projects.length" class="hint">暂无待发送项目：请先在「项目关联人」页为项目添加关联人并勾选主送/抄送/密送。</p>
      <table v-else>
        <thead>
          <tr>
            <th>项目编码</th>
            <th>项目名称</th>
            <th>工程责任人</th>
            <th>收件人</th>
            <th>周报日期</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p.projectCode">
            <td class="nowrap">{{ p.projectCode }}</td>
            <td>{{ p.projectName }}</td>
            <td class="nowrap">{{ p.owner }}</td>
            <td class="nowrap">
              主送 {{ p.toCount }} / 抄送 {{ p.ccCount }} / 密送 {{ p.bccCount }}
            </td>
            <td class="nowrap">{{ p.reportDate || '（无进展）' }}</td>
            <td class="nowrap">
              <span v-if="p.sentThisWeek" class="badge sent">本周已发送</span>
              <span v-else class="badge pending">待发送</span>
            </td>
            <td class="nowrap">
              <button class="link-btn" @click="openPreview(p.projectCode)">预览</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 发送记录 -->
    <div class="card">
      <h3>发送记录（最近 50 条）</h3>
      <p v-if="!logs.length" class="hint">暂无发送记录。</p>
      <table v-else>
        <thead>
          <tr>
            <th>时间</th>
            <th>项目</th>
            <th>主题</th>
            <th>主送</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in logs" :key="l.id">
            <td class="nowrap">{{ l.created_at }}</td>
            <td>{{ l.project_name || l.project_code }}</td>
            <td>{{ l.subject }}</td>
            <td>{{ l.to_addr }}</td>
            <td class="nowrap">
              <span :class="['badge', l.status === 'success' ? 'sent' : 'failed']">
                {{ l.status === 'success' ? '成功' : '失败' }}
              </span>
              <span v-if="l.error" class="err-text" :title="l.error">{{ l.error }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 预览弹窗：人工确认后才发送 -->
    <div v-if="preview" class="modal-mask" @click.self="preview = null">
      <div class="modal">
        <h3>邮件预览 — {{ preview.projectCode }}</h3>
        <div class="mail-meta">
          <div><span class="meta-label">主题</span>{{ preview.subject }}</div>
          <div><span class="meta-label">主送</span>{{ preview.to.join('、') || '（无）' }}</div>
          <div><span class="meta-label">抄送</span>{{ preview.cc.join('、') || '（无）' }}</div>
          <div><span class="meta-label">密送</span>{{ preview.bcc.join('、') || '（无）' }}</div>
        </div>
        <div class="mail-body" v-html="preview.html"></div>
        <p v-if="sendTip" :class="sendTip.ok ? 'ok-tip' : 'error'">{{ sendTip.message }}</p>
        <div class="modal-actions">
          <button class="primary" :disabled="sending" @click="confirmSend(false)">
            {{ sending ? '发送中…' : '确认发送' }}
          </button>
          <button class="primary" :disabled="sending || !hasNext" @click="confirmSend(true)">
            发送并预览下一个
          </button>
          <button :disabled="sending" @click="preview = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

const placeholders = '{{项目名称}} {{项目编码}} {{周进展}} {{建设内容}} {{工程责任人}} {{责任人电话}} {{责任人邮箱}} {{周报日期}}';

const tpl = ref({ subject: '', body: '', signature: '' });
const projects = ref([]);
const logs = ref([]);
const error = ref('');
const savingTpl = ref(false);
const tplSavedTip = ref('');

const preview = ref(null); // 当前预览的邮件
const sending = ref(false);
const sendTip = ref(null);

const hasNext = computed(() => {
  if (!preview.value) return false;
  const idx = projects.value.findIndex((p) => p.projectCode === preview.value.projectCode);
  return idx >= 0 && idx < projects.value.length - 1;
});

async function load() {
  error.value = '';
  try {
    const [t, p, l] = await Promise.all([
      api.getMailTemplate(),
      api.getMailProjects(),
      api.getMailLogs(),
    ]);
    tpl.value = t.template;
    projects.value = p.projects;
    logs.value = l.logs;
  } catch (e) {
    error.value = e.message;
  }
}

async function saveTpl() {
  savingTpl.value = true;
  error.value = '';
  try {
    await api.saveMailTemplate(tpl.value);
    tplSavedTip.value = '已保存';
    setTimeout(() => { tplSavedTip.value = ''; }, 2000);
  } catch (e) {
    error.value = e.message;
  } finally {
    savingTpl.value = false;
  }
}

async function openPreview(code) {
  error.value = '';
  sendTip.value = null;
  try {
    const res = await api.previewMail(code);
    preview.value = res.mail;
  } catch (e) {
    error.value = e.message;
  }
}

async function confirmSend(next) {
  if (!preview.value) return;
  const code = preview.value.projectCode;
  sending.value = true;
  sendTip.value = null;
  try {
    const res = await api.sendMail(code);
    // 刷新列表与记录（发送状态可能变化）
    const [p, l] = await Promise.all([api.getMailProjects(), api.getMailLogs()]);
    projects.value = p.projects;
    logs.value = l.logs;
    if (next && hasNext.value) {
      const idx = projects.value.findIndex((x) => x.projectCode === code);
      const nextCode = projects.value[idx + 1]?.projectCode;
      if (nextCode) {
        await openPreview(nextCode);
        return;
      }
    }
    sendTip.value = { ok: true, message: res.message || '发送成功' };
  } catch (e) {
    sendTip.value = { ok: false, message: e.message };
    // 失败也刷新记录
    try {
      const l = await api.getMailLogs();
      logs.value = l.logs;
    } catch { /* 忽略 */ }
  } finally {
    sending.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.form-card { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.form-card h3 { margin: 0; font-size: 16px; }
.form-card label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.form-card textarea {
  font-family: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  resize: vertical;
}
.hint { font-size: 12px; color: var(--ink-mute); margin: 0; }
.actions { display: flex; gap: 12px; margin-top: 4px; }
.card { margin-bottom: 16px; }
.card h3 { margin-top: 0; font-size: 16px; }
.nowrap { white-space: nowrap; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.badge.sent { background: #e8f5e9; color: #16a34a; }
.badge.pending { background: #fff7e6; color: #d48806; }
.badge.failed { background: #fdecec; color: #dc2626; }
.err-text {
  display: inline-block;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  font-size: 12px;
  color: #dc2626;
  margin-left: 6px;
}

/* 预览弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  z-index: 200;
}
.modal {
  background: var(--canvas);
  border-radius: var(--r-md);
  width: 760px;
  max-width: 100%;
  max-height: calc(100vh - 80px);
  overflow: auto;
  padding: 20px 24px;
}
.modal h3 { margin: 0 0 12px; font-size: 16px; }
.mail-meta {
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.9;
  word-break: break-all;
}
.meta-label {
  display: inline-block;
  width: 44px;
  color: var(--ink-secondary);
}
.mail-body {
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  overflow: hidden;
  margin-bottom: 12px;
}
.modal-actions { display: flex; gap: 12px; }
.ok-tip { font-size: 14px; color: #16a34a; margin: 0 0 8px; }
</style>
