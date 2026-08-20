<template>
  <div>
    <div class="filters">
      <label>周报时间
        <select v-model="filters.report_date" @change="load">
          <option v-for="d in dates" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <label>分类
        <select v-model="filters.category" @change="load">
          <option value="">全部</option>
          <option v-for="c in options.categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label>工程责任人
        <select v-model="filters.owner" @change="load">
          <option value="">全部</option>
          <option v-for="o in options.owners" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>
      <label>项目阶段
        <select v-model="filters.stage" @change="load">
          <option value="">全部</option>
          <option v-for="s in options.stages" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!reportDate">暂无数据，请先到「数据导入」页导入 Excel。</p>
    <table v-else>
      <thead>
        <tr>
          <th>专业类别</th><th>项目编码</th><th>项目名称</th>
          <th>立项批复日期</th><th>分类</th><th>工程责任人</th>
          <th>立项金额（万元）</th><th>项目阶段</th><th>建设内容</th>
          <th>周进展（{{ reportDate }}）</th><th>请购完成率</th>
          <th>是否交底</th><th>到货完成率</th><th>是否上线交维</th>
          <th>是否竣工验收</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.category_major }}</td>
          <td>{{ r.project_code }}</td>
          <td>{{ r.project_name }}</td>
          <td>{{ r.approval_date }}</td>
          <td>{{ r.category }}</td>
          <td>{{ r.owner }}</td>
          <td>{{ r.budget_wan }}</td>
          <td>{{ r.stage }}</td>
          <td class="pre">{{ r.content }}</td>
          <td class="pre">{{ r.progress }}</td>
          <td>{{ fmtRate(r.purchase_rate) }}</td>
          <td>{{ r.disclosure }}</td>
          <td>{{ fmtRate(r.arrival_rate) }}</td>
          <td>{{ r.online_handover }}</td>
          <td>{{ r.final_acceptance }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api.js';

const dates = ref([]);
const options = reactive({ categories: [], owners: [], stages: [] });
const filters = reactive({ report_date: '', category: '', owner: '', stage: '' });
const rows = ref([]);
const reportDate = ref('');
const error = ref('');

function fmtRate(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : v;
}

async function load() {
  error.value = '';
  try {
    const res = await api.getReports({ ...filters });
    rows.value = res.rows;
    reportDate.value = res.reportDate;
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(async () => {
  try {
    const [d, f] = await Promise.all([api.getReportDates(), api.getFilters()]);
    dates.value = d.dates;
    Object.assign(options, f);
    if (d.dates.length) filters.report_date = d.dates[0];
    await load();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.filters { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.filters label { display: flex; align-items: center; gap: 6px; }
.error { color: #c00; }
.pre { white-space: pre-wrap; max-width: 260px; }
</style>
