<template>
  <div>
    <h2>数据导入</h2>

    <div class="card form-card">
      <div class="form">
        <label>Excel 文件
          <input type="file" accept=".xlsx,.xls" @change="onFile" />
        </label>
        <label>周报时间
          <input type="date" v-model="reportDate" />
        </label>
        <button class="primary" :disabled="!file || !reportDate || loading" @click="submit">
          {{ loading ? '导入中…' : '导入' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div v-if="result" class="card result">
      <h3>导入完成</h3>
      <p class="result-date">周报时间：{{ result.reportDate }}</p>
      <ul class="stats">
        <li><span class="num stat-num">{{ result.inserted }}</span> 新增项目</li>
        <li><span class="num stat-num">{{ result.updated }}</span> 更新项目</li>
        <li><span class="num stat-num">{{ result.progressWritten }}</span> 写入进展</li>
        <li><span class="num stat-num">{{ result.skipped }}</span> 跳过行（无项目编码）</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import * as xlsx from 'xlsx';
import { importWithConfirm } from '../importFlow.js';

const file = ref(null);
const reportDate = ref('');
const loading = ref(false);
const error = ref('');
const result = ref(null);

async function onFile(e) {
  error.value = '';
  result.value = null;
  file.value = e.target.files[0] || null;
  if (!file.value) return;
  // 从 L 列表头（第 12 列，0 基索引 11）解析日期预填
  try {
    const buf = await file.value.arrayBuffer();
    const wb = xlsx.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, range: 0, blankrows: false });
    const header = rows[0] || [];
    const m = /(\d{4})(\d{2})(\d{2})/.exec(String(header[11] ?? ''));
    if (m) reportDate.value = `${m[1]}-${m[2]}-${m[3]}`;
  } catch {
    /* 预填失败不阻塞，用户可手选日期 */
  }
}

async function submit() {
  loading.value = true;
  error.value = '';
  result.value = null;
  try {
    const r = await importWithConfirm(file.value, reportDate.value, (msg) =>
      window.confirm(`${msg}\n\n是否覆盖？`)
    );
    if (r) result.value = r;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.form-card { margin-bottom: 16px; }
.form { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.form label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.result { max-width: 480px; }
.result-date { color: var(--ink-mute); font-size: 13px; margin: 0 0 12px; }
.stats { list-style: none; margin: 0; padding: 0; display: flex; gap: 24px; }
.stats li { font-size: 13px; color: var(--ink-mute); }
.stat-num {
  display: block;
  font-size: 26px;
  font-weight: 300;
  letter-spacing: -0.26px;
  color: var(--ink);
}
</style>
