<template>
  <div>
    <p><router-link to="/" class="back-link">← 返回项目列表</router-link></p>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="project">
      <!-- 上部：基础信息 -->
      <div class="card info-card">
        <h3>基础信息</h3>
        <div class="info-grid">
          <div class="info-item"><label>专业类别</label><span>{{ project.category_major }}</span></div>
          <div class="info-item"><label>项目编码</label><span class="num">{{ project.project_code }}</span></div>
          <div class="info-item wide"><label>项目名称</label><span>{{ project.project_name }}</span></div>
          <div class="info-item"><label>立项批复日期</label><span class="num">{{ project.approval_date }}</span></div>
          <div class="info-item"><label>工程责任人</label><span>{{ project.owner }}</span></div>
          <div class="info-item"><label>立项金额（万元）</label><span class="num">{{ project.budget_wan }}</span></div>
          <div class="info-item">
            <label>分类</label>
            <select v-model="editCategory">
              <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="info-item">
            <label>项目阶段</label>
            <select v-model="editStage">
              <option v-for="s in STAGES" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="info-item wide"><label>建设内容</label><span>{{ project.content }}</span></div>
        </div>
        <div class="save-row">
          <button class="primary" :disabled="!dirty || saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
          <span v-if="savedTip" class="saved-tip">{{ savedTip }}</span>
          <span v-if="saveError" class="error">{{ saveError }}</span>
        </div>
      </div>

      <!-- 下部：历史进展 -->
      <div class="card progress-card">
        <h3>历史进展</h3>
        <p v-if="!progress.length" class="empty">暂无进展记录</p>
        <table v-else>
          <thead>
            <tr>
              <th>时间</th><th>周进展</th><th>请购完成率</th><th>是否交底</th>
              <th>到货完成率</th><th>是否上线交维</th><th>是否竣工验收</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in progress" :key="p.report_date">
              <td class="num nowrap">{{ p.report_date }}</td>
              <td class="pre">{{ p.progress }}</td>
              <td class="num">{{ fmtRate(p.purchase_rate) }}</td>
              <td>{{ p.disclosure }}</td>
              <td class="num">{{ fmtRate(p.arrival_rate) }}</td>
              <td>{{ p.online_handover }}</td>
              <td>{{ p.final_acceptance }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';

const CATEGORIES = ['收入相关', '基础能力', '支撑后端', '拟取消'];
const STAGES = ['勘察设计阶段', '项目实施阶段', '工程验收阶段', '终验归档阶段'];

const route = useRoute();
const code = route.params.code;

const project = ref(null);
const progress = ref([]);
const error = ref('');
const editCategory = ref('');
const editStage = ref('');
const saving = ref(false);
const savedTip = ref('');
const saveError = ref('');

const dirty = computed(() =>
  project.value &&
  (editCategory.value !== project.value.category || editStage.value !== project.value.stage)
);

function fmtRate(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : v;
}

async function save() {
  saving.value = true;
  savedTip.value = '';
  saveError.value = '';
  try {
    await api.updateProject(code, { category: editCategory.value, stage: editStage.value });
    project.value.category = editCategory.value;
    project.value.stage = editStage.value;
    savedTip.value = '已保存';
    setTimeout(() => { savedTip.value = ''; }, 2000);
  } catch (e) {
    saveError.value = e.message;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const res = await api.getProject(code);
    project.value = res.project;
    progress.value = res.progress;
    editCategory.value = res.project.category;
    editStage.value = res.project.stage;
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.back-link { color: var(--primary); text-decoration: none; font-size: 14px; }
.info-card { margin-bottom: 24px; }
.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px 24px;
}
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item.wide { grid-column: span 3; }
.info-item label { font-size: 13px; color: var(--ink-mute); }
.info-item span { font-size: 15px; }
.info-item select { align-self: flex-start; min-width: 160px; }
.save-row { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
.saved-tip { color: #1a7f37; font-size: 13px; }
.progress-card { padding-bottom: 16px; }
.pre { white-space: pre-wrap; max-width: 480px; }
.nowrap { white-space: nowrap; }
.empty { color: var(--ink-mute); }
</style>
