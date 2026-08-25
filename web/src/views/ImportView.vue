<template>
  <div>
    <h2>数据导入</h2>

    <!-- 一、云文档周报数据导入 -->
    <div class="card form-card">
      <h3>云文档周报数据导入</h3>
      <div class="form">
        <label>Excel / CSV 文件
          <input type="file" accept=".xlsx,.xls,.csv" @change="onFile" />
        </label>
        <label>周报时间
          <input type="date" v-model="reportDate" />
        </label>
        <button class="primary" :disabled="!file || !reportDate || loading" @click="submit">
          {{ loading ? '导入中…' : '导入' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="result" class="result">
        <p class="result-date">导入完成（周报时间：{{ result.reportDate }}）</p>
        <ul class="stats">
          <li><span class="num stat-num">{{ result.inserted }}</span> 新增项目</li>
          <li><span class="num stat-num">{{ result.updated }}</span> 更新项目</li>
          <li><span class="num stat-num">{{ result.progressWritten }}</span> 写入进展</li>
          <li><span class="num stat-num">{{ result.skipped }}</span> 跳过行</li>
        </ul>
      </div>
    </div>

    <!-- 二、PMS 宽表数据导入 -->
    <div class="card form-card">
      <h3>PMS 宽表数据导入</h3>
      <p class="pms-hint">
        只处理"工程管理经理-主"在人员配置中的项目：阶段不一致的需逐个确认后更新，库里没有的新增项目自动导入。
      </p>
      <div class="form">
        <label>Excel / ZIP 文件
          <input type="file" accept=".xlsx,.xls,.zip" @change="onPmsFile" />
        </label>
        <button class="primary" :disabled="!pmsFile || pmsLoading" @click="previewPms">
          {{ pmsLoading ? '分析中…' : '预览' }}
        </button>
      </div>
      <p v-if="pmsError" class="error">{{ pmsError }}</p>

      <!-- 预览结果 -->
      <div v-if="pmsPreview" class="result">
        <p class="result-date">分析完成，请确认阶段变化</p>
        <ul class="stats">
          <li><span class="num stat-num">{{ pmsPreview.toInsert.length }}</span> 新增项目</li>
          <li><span class="num stat-num">{{ stageChangeCount }}</span> 阶段变化待确认</li>
          <li><span class="num stat-num">{{ pmsPreview.unchanged }}</span> 无变化</li>
          <li><span class="num stat-num">{{ pmsPreview.skippedNoPerson }}</span> 跳过（非配置人员）</li>
          <li><span class="num stat-num">{{ pmsPreview.skippedStage }}</span> 跳过（非标准阶段）</li>
        </ul>

        <template v-if="pmsPreview.toInsert.length">
          <p class="detail-title">将自动新增的项目：</p>
          <ul class="detail-list">
            <li v-for="c in pmsPreview.toInsert" :key="c.projectCode" class="num">
              {{ c.projectCode }} / {{ c.projectName }} / {{ c.manager }}
            </li>
          </ul>
        </template>

        <template v-if="stageChanges.length">
          <p class="detail-title">阶段变化（请点击"变更"或"不变更"）：</p>
          <ul class="detail-list stage-list">
            <li v-for="u in stageChanges" :key="u.projectCode" class="stage-item" :class="{ 'only-fill': u.onlyFill }">
              <div class="stage-info">
                <span class="num">{{ u.projectCode }}</span>
                <span>{{ u.projectName }}</span>
                <span>{{ u.manager }}</span>
                <span class="stage-arrow">{{ u.from }} → {{ u.to }}</span>
                <span v-if="u.onlyFill" class="tag">仅补充日期/金额</span>
              </div>
              <div v-if="!u.onlyFill" class="stage-actions">
                <button
                  :class="['btn-sm', pmsConfirmed.has(u.projectCode) ? 'primary' : '']"
                  @click="confirmChange(u.projectCode, true)"
                >变更</button>
                <button
                  :class="['btn-sm', !pmsConfirmed.has(u.projectCode) ? 'danger-btn' : '']"
                  @click="confirmChange(u.projectCode, false)"
                >不变更</button>
              </div>
            </li>
          </ul>
          <div class="apply-row">
            <button class="primary" :disabled="pmsApplyLoading" @click="applyPms">
              {{ pmsApplyLoading ? '导入中…' : '确认导入' }}
            </button>
            <button @click="resetPms">重新选择文件</button>
          </div>
        </template>
        <template v-else-if="pmsPreview.toInsert.length">
          <div class="apply-row">
            <button class="primary" :disabled="pmsApplyLoading" @click="applyPms">
              {{ pmsApplyLoading ? '导入中…' : '确认导入' }}
            </button>
            <button @click="resetPms">重新选择文件</button>
          </div>
        </template>
      </div>

      <!-- 导入完成结果 -->
      <div v-if="pmsResult" class="result">
        <p class="result-date">PMS 宽表导入完成</p>
        <ul class="stats">
          <li><span class="num stat-num">{{ pmsResult.updated }}</span> 更新阶段</li>
          <li><span class="num stat-num">{{ pmsResult.inserted }}</span> 新增项目</li>
        </ul>
        <template v-if="pmsResult.updatedList.length">
          <p class="detail-title">已更新阶段明细：</p>
          <ul class="detail-list">
            <li v-for="u in pmsResult.updatedList" :key="u.projectCode" class="num">
              {{ u.projectCode }} / {{ u.projectName }} / {{ u.manager }}：{{ u.from }} → {{ u.to }}
            </li>
          </ul>
        </template>
        <template v-if="pmsResult.insertedList.length">
          <p class="detail-title">已新增项目：</p>
          <ul class="detail-list">
            <li v-for="c in pmsResult.insertedList" :key="c.projectCode" class="num">
              {{ c.projectCode }} / {{ c.projectName }} / {{ c.manager }}
            </li>
          </ul>
        </template>
        <div class="apply-row">
          <button @click="resetPms">重新导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import * as xlsx from 'xlsx';
import { importWithConfirm } from '../importFlow.js';
import { api } from '../api.js';

// ---- 云文档周报导入 ----
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

// ---- PMS 宽表导入 ----
const pmsFile = ref(null);
const pmsLoading = ref(false);
const pmsApplyLoading = ref(false);
const pmsError = ref('');
const pmsPreview = ref(null);
const pmsConfirmed = ref(new Set());
const pmsResult = ref(null);

function onPmsFile(e) {
  pmsError.value = '';
  pmsPreview.value = null;
  pmsResult.value = null;
  pmsConfirmed.value = new Set();
  pmsFile.value = e.target.files[0] || null;
}

const stageChanges = computed(() => pmsPreview.value?.stageChanges || []);
const stageChangeCount = computed(() => stageChanges.value.filter((u) => !u.onlyFill).length);

function confirmChange(code, yes) {
  const next = new Set(pmsConfirmed.value);
  if (yes) next.add(code);
  else next.delete(code);
  pmsConfirmed.value = next;
}

async function previewPms() {
  pmsLoading.value = true;
  pmsError.value = '';
  pmsPreview.value = null;
  pmsResult.value = null;
  pmsConfirmed.value = new Set();
  try {
    const preview = await api.previewPms(pmsFile.value);
    pmsPreview.value = preview;
    // 仅补充日期/金额（非阶段变化）的自动确认
    const auto = new Set();
    for (const u of preview.stageChanges || []) {
      if (u.onlyFill) auto.add(u.projectCode);
    }
    pmsConfirmed.value = auto;
  } catch (e) {
    pmsError.value = e.message;
  } finally {
    pmsLoading.value = false;
  }
}

async function applyPms() {
  if (!pmsPreview.value) return;
  pmsApplyLoading.value = true;
  pmsError.value = '';
  try {
    const confirmedUpdates = pmsPreview.value.stageChanges.filter((u) =>
      pmsConfirmed.value.has(u.projectCode)
    );
    pmsResult.value = await api.applyPms({
      toInsert: pmsPreview.value.toInsert,
      confirmedUpdates,
    });
    pmsPreview.value = null;
  } catch (e) {
    pmsError.value = e.message;
  } finally {
    pmsApplyLoading.value = false;
  }
}

function resetPms() {
  pmsFile.value = null;
  pmsPreview.value = null;
  pmsResult.value = null;
  pmsConfirmed.value = new Set();
  pmsError.value = '';
}
</script>

<style scoped>
.form-card { margin-bottom: 24px; }
.form { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.form label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.pms-hint { font-size: 13px; color: var(--ink-mute); margin: 0 0 12px; }
.result { margin-top: 16px; }
.result-date { color: var(--ink-mute); font-size: 13px; margin: 0 0 12px; }
.stats { list-style: none; margin: 0; padding: 0; display: flex; gap: 24px; flex-wrap: wrap; }
.stats li { font-size: 13px; color: var(--ink-mute); }
.stat-num {
  display: block;
  font-size: 26px;
  font-weight: 300;
  letter-spacing: -0.26px;
  color: var(--ink);
}
.detail-title { font-size: 13px; color: var(--ink-secondary); margin: 16px 0 4px; }
.detail-list { margin: 0; padding-left: 20px; font-size: 13px; }
.stage-list { list-style: none; padding: 0; }
.stage-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: #fafbfc;
}
.stage-item.only-fill { background: #f0f9ff; border-color: #bae6fd; }
.stage-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.stage-arrow { color: var(--ink-secondary); }
.tag { font-size: 12px; color: #0369a1; background: #e0f2fe; padding: 2px 6px; border-radius: var(--r-sm); }
.stage-actions { display: flex; gap: 8px; }
.btn-sm { padding: 4px 10px; font-size: 12px; border-radius: var(--r-sm); cursor: pointer; }
.apply-row { display: flex; gap: 12px; margin-top: 16px; }
</style>
