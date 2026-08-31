<template>
  <div>
    <h2>邮箱配置</h2>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="card form-card">
      <label>SMTP 服务器
        <input type="text" v-model="form.smtpHost" placeholder="如 smtp.example.com" />
      </label>
      <div class="row-2">
        <label>端口
          <input type="number" v-model.number="form.smtpPort" placeholder="465" />
        </label>
        <label class="check-label">
          <input type="checkbox" v-model="form.smtpSecure" /> 使用 SSL/TLS（465 端口勾选，587 端口不勾）
        </label>
      </div>
      <label>邮箱账号
        <input type="text" v-model="form.smtpUser" placeholder="如 zhangsan@example.com" />
      </label>
      <label>授权码/密码
        <input
          type="password"
          v-model="form.smtpPass"
          :placeholder="hasPassword ? '已设置，留空表示不修改' : '邮箱客户端授权码（非网页登录密码）'"
        />
      </label>
      <label>发件人名称
        <input type="text" v-model="form.fromName" placeholder="如 核心网室（可选）" />
      </label>
      <label>发件地址
        <input type="text" v-model="form.fromAddr" placeholder="默认同邮箱账号（可选）" />
      </label>
      <p class="hint">
        IMAP 配置由系统自动推断：{{ form.smtpHost ? `imap 服务器 ${imapInferred}:993（TLS）` : '按 SMTP 服务器推断（smtp.xxx → imap.xxx:993）' }}，用于把发出的邮件存档到「已发送」文件夹。
      </p>
      <div class="actions">
        <button class="primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : (savedTip || '保存') }}</button>
      </div>
    </div>

    <div class="card form-card">
      <h3>发送测试</h3>
      <p class="hint">使用上方已保存的配置发送一封测试邮件，验证 SMTP 发送和「已发送」存档完整链路。</p>
      <div class="test-row">
        <input type="email" v-model="testTo" placeholder="测试收件地址，如自己的邮箱" />
        <button class="primary" :disabled="testing" @click="sendTest">
          {{ testing ? '发送中…（最长约 30 秒）' : '发送测试邮件' }}
        </button>
      </div>
      <p v-if="testResult" :class="testResult.ok ? 'ok-tip' : 'error'">{{ testResult.message }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

const form = ref({
  smtpHost: '', smtpPort: 465, smtpSecure: true,
  smtpUser: '', smtpPass: '', fromName: '', fromAddr: '',
});
const hasPassword = ref(false);
const error = ref('');
const saving = ref(false);
const savedTip = ref('');
const testTo = ref('');
const testing = ref(false);
const testResult = ref(null);

const imapInferred = computed(
  () => String(form.value.smtpHost || '').replace(/^smtp\./i, 'imap.')
);

async function load() {
  try {
    const { config } = await api.getEmailConfig();
    if (config) {
      form.value = { ...form.value, ...config, smtpPass: '' };
      hasPassword.value = config.hasPassword;
    }
  } catch (e) {
    error.value = e.message;
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    await api.saveEmailConfig(form.value);
    hasPassword.value = hasPassword.value || !!form.value.smtpPass;
    form.value.smtpPass = '';
    savedTip.value = '已保存';
    setTimeout(() => { savedTip.value = ''; }, 2000);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function sendTest() {
  testing.value = true;
  testResult.value = null;
  error.value = '';
  try {
    // 先保存再测试，保证用的是页面上最新的配置
    await api.saveEmailConfig(form.value);
    hasPassword.value = hasPassword.value || !!form.value.smtpPass;
    form.value.smtpPass = '';
    testResult.value = await api.testEmailConfig(testTo.value);
  } catch (e) {
    testResult.value = { ok: false, message: e.message };
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.form-card { max-width: 640px; display: flex; flex-direction: column; gap: 12px; }
.form-card h3 { margin: 0; font-size: 16px; }
.form-card label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.row-2 { display: flex; gap: 24px; align-items: flex-end; }
.row-2 label:first-child { width: 120px; }
.check-label { flex-direction: row !important; align-items: center; gap: 8px !important; padding-bottom: 8px; }
.hint { font-size: 12px; color: var(--ink-mute); margin: 0; }
.actions { display: flex; gap: 12px; margin-top: 4px; }
.test-row { display: flex; gap: 12px; }
.test-row input { flex: 1; }
.ok-tip { font-size: 14px; color: #16a34a; margin: 0; }
</style>
