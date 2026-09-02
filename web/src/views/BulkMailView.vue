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

    <!-- 通用抄送人配置 -->
    <div class="card">
      <h3>通用抄送人</h3>
      <p class="hint">每封邮件的抄送 = 项目关联人勾选的抄送 + 此处开启「全量抄送」的人（按下方顺序）+ 该项目工程责任人。修改后点「保存」生效。</p>
      <table v-if="ccList.length" class="cc-table">
        <thead>
          <tr><th>姓名</th><th>邮箱</th><th>全量抄送</th><th>顺序</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in ccList" :key="i">
            <td><input type="text" v-model="c.name" placeholder="姓名" /></td>
            <td><input type="text" v-model="c.email" placeholder="邮箱" class="email-input" /></td>
            <td class="center"><input type="checkbox" v-model="c.enabled" /></td>
            <td class="center nowrap">
              <button class="link-btn" :disabled="i === 0" @click="moveCc(i, -1)">↑</button>
              <button class="link-btn" :disabled="i === ccList.length - 1" @click="moveCc(i, 1)">↓</button>
            </td>
            <td class="center"><button class="link-btn danger" @click="ccList.splice(i, 1)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="hint">暂无通用抄送人。</p>
      <div class="actions">
        <button @click="ccList.push({ name: '', email: '', enabled: true })">+ 添加</button>
        <button class="primary" :disabled="savingCc" @click="saveCc">{{ savingCc ? '保存中…' : (ccSavedTip || '保存') }}</button>
      </div>
      <p v-if="ccError" class="error">{{ ccError }}</p>
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
const ccList = ref([]);
const error = ref('');
const savingTpl = ref(false);
const tplSavedTip = ref('');
const savingCc = ref(false);
const ccSavedTip = ref('');
const ccError = ref('');

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
    const [t, p, l, cc] = await Promise.all([
      api.getMailTemplate(),
      api.getMailProjects(),
      api.getMailLogs(),
      api.getMailCcList(),
    ]);
    tpl.value = t.template;
    projects.value = p.projects;
    logs.value = l.logs;
    ccList.value = cc.list.map((r) => ({ name: r.name, email: r.email, enabled: !!r.enabled }));
  } catch (e) {
    error.value = e.message;
  }
}

function moveCc(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= ccList.value.length) return;
  const tmp = ccList.value[i];
  ccList.value[i] = ccList.value[j];
  ccList.value[j] = tmp;
}

async function saveCc() {
  savingCc.value = true;
  ccError.value = '';
  try {
    await api.saveMailCcList(ccList.value);
    ccSavedTip.value = '已保存';
    setTimeout(() => { ccSavedTip.value = ''; }, 2000);
    // 抄送名单变化会影响待发送项目的统计
    const p = await api.getMailProjects();
    projects.value = p.projects;
  } catch (e) {
    ccError.value = e.message;
  } finally {
    savingCc.value = false;
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

/* 通用抄送人表格 */
.cc-table { margin-bottom: 12px; }
.cc-table input[type='text'] {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  font-size: 14px;
  box-sizing: border-box;
}
.cc-table .email-input { min-width: 280px; }
.center { text-align: center; }

/* 文字链接式按钮 */
.link-btn {
  border: none;
  background: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
}
.link-btn:hover:not(:disabled) { text-decoration: underline; }
.link-btn:disabled { color: var(--ink-mute); cursor: default; }
.link-btn.danger { color: #dc2626; }
</style>
