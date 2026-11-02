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
        只处理"工程管理经理-主"在工程责任人配置中的项目：阶段不一致的需逐个确认后更新，库里没有的新增项目自动导入。
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
          <li><span class="num stat-num">{{ pmsPreview.skippedOldYear ?? 0 }}</span> 跳过（2026年前不新增）</li>
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
                  :class="['btn-sm', pmsConfirmed.has(u.projectCode) ? 'btn-green' : 'btn-plain']"
                  @click="confirmChange(u.projectCode, true)"
                >变更</button>
                <button
                  :class="['btn-sm', !pmsConfirmed.has(u.projectCode) ? 'btn-green' : 'btn-plain']"
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
          <li><span class="num stat-num">{{ pmsResult.moneyUpdated ?? 0 }}</span> 更新金额</li>
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

    <!-- 三、转资工单导入 -->
    <div class="card form-card">
      <h3>转资工单导入</h3>
      <p class="pms-hint">
        从转资工单表按项目编码汇总「转资合计金额」（只统计 审批状态=审批通过 且 导入状态=成功 的行，多行求和，单位元自动转万元），
        全量覆盖写入项目的累计转资金额；本表是该字段的权威来源。<br />
        转资工单清单文件下载路径：PMS：项目管理 / 工程转资 / 转资报表 / 转资工单查询
      </p>
      <div class="form">
        <label>Excel 文件
          <input type="file" accept=".xlsx,.xls" @change="onTransferFile" />
        </label>
        <button class="primary" :disabled="!transferFile || transferLoading" @click="submitTransfer">
          {{ transferLoading ? '导入中…' : '导入' }}
        </button>
      </div>
      <!-- 导入进度：上传显示真实百分比，解析/写库显示处理中 -->
      <div v-if="transferProgress !== null" class="transfer-progress">
        <div class="tp-bar" :class="{ busy: transferPhase === 'process' }">
          <div class="tp-fill" :style="{ width: transferProgress + '%' }"></div>
        </div>
        <p class="tp-text">
          <template v-if="transferPhase === 'upload'">正在上传文件… {{ Math.min(99, Math.round(transferProgress / 0.9)) }}%</template>
          <template v-else-if="transferPhase === 'process'">服务器解析中（大文件约需 1 分钟），写入数据库…</template>
          <template v-else>导入完成</template>
        </p>
      </div>
      <p v-if="transferError" class="error">{{ transferError }}</p>
      <div v-if="transferResult" class="result">
        <p class="result-date">转资工单导入完成</p>
        <ul class="stats">
          <li><span class="num stat-num">{{ transferResult.updated }}</span> 更新项目</li>
          <li><span class="num stat-num">{{ transferResult.countedRows }}</span> 有效工单行</li>
          <li><span class="num stat-num">{{ transferResult.unmatched }}</span> 库中无此项目</li>
        </ul>
        <template v-if="transferResult.unmatchedList?.length">
          <p class="detail-title">库中未匹配的项目编码（前 20 个）：</p>
          <ul class="detail-list">
            <li v-for="c in transferResult.unmatchedList" :key="c" class="num">{{ c }}</li>
          </ul>
        </template>
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

const transferFile = ref(null);
const transferLoading = ref(false);
const transferResult = ref(null);
const transferError = ref('');
const transferProgress = ref(null); // 0-100；null 表示未开始
const transferPhase = ref('upload'); // upload / process / done

function onTransferFile(e) {
  transferFile.value = e.target.files[0] || null;
  transferResult.value = null;
  transferError.value = '';
  transferProgress.value = null;
}

// XHR 上传：upload.onprogress 提供真实上传百分比；响应返回后进入解析/写库阶段
function uploadWithProgress(file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // 上传阶段最多到 90%；字节传完立即切处理中阶段，避免显示"100% 像已完成"
        const pct = Math.round((e.loaded / e.total) * 90);
        transferProgress.value = pct;
        if (pct >= 90) transferPhase.value = 'process';
      }
    };
    xhr.upload.onload = () => {
      transferPhase.value = 'process';
      transferProgress.value = 90;
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.error || `请求失败（${xhr.status}）`));
      } catch {
        reject(new Error('响应解析失败'));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误，请求失败'));
    xhr.open('POST', '/api/import-transfer');
    xhr.send(fd);
  });
}

async function submitTransfer() {
  transferLoading.value = true;
  transferError.value = '';
  transferResult.value = null;
  transferProgress.value = 0;
  transferPhase.value = 'upload';
  try {
    transferResult.value = await uploadWithProgress(transferFile.value);
    transferPhase.value = 'done';
    transferProgress.value = 100;
  } catch (e) {
    transferError.value = e.message;
    transferProgress.value = null;
  } finally {
    transferLoading.value = false;
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
      moneyRows: pmsPreview.value.moneyRows || [],
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
/* 转资导入进度条 */
.transfer-progress { margin-top: 12px; max-width: 480px; }
.tp-bar {
  height: 10px;
  background: var(--canvas-soft, #eef0f2);
  border-radius: 5px;
  overflow: hidden;
}
.tp-fill {
  height: 100%;
  background: linear-gradient(90deg, #0086d4, #33a3dc);
  border-radius: 5px;
  transition: width 0.2s ease;
}
.tp-text { margin: 6px 0 0; font-size: 13px; color: var(--ink-mute); }
/* 解析/写库阶段：条纹滚动动画，表示仍在处理 */
.tp-bar.busy .tp-fill {
  background: repeating-linear-gradient(
    45deg, #0086d4 0 12px, #33a3dc 12px 24px
  );
  animation: tp-slide 1s linear infinite;
}
@keyframes tp-slide {
  from { background-position: 0 0; }
  to { background-position: 34px 0; }
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
/* 阶段变化确认按钮：选中态绿底，未选中白底灰边 */
.btn-green { background: #16a34a; color: #fff; border: 1px solid #16a34a; }
.btn-plain { background: #fff; color: var(--ink-secondary); border: 1px solid var(--hairline); }
.apply-row { display: flex; gap: 12px; margin-top: 16px; }
</style>
