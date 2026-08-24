<template>
  <div>
    <h2>项目统计</h2>
    <p v-if="error" class="error">{{ error }}</p>

    <template v-if="stats">
      <!-- 一、项目总数 + 立项总金额 + 立项月份柱状图/金额折线图 -->
      <div class="total-card">
        <div class="total-glow"></div>
        <div class="total-head">
          <div class="total-num num">{{ stats.total }}</div>
          <div class="total-label">项目总数</div>
          <div class="total-num num budget-num">{{ stats.totalBudgetYi }}</div>
          <div class="total-label">立项总金额（亿元）</div>
        </div>
        <div class="chart">
          <!-- 折线图（立项金额，万元）在柱状图上方，不重叠 -->
          <svg class="line-chart" :viewBox="`0 0 ${chartW} ${lineH}`" preserveAspectRatio="none" :style="{ minWidth: chartMinWidth }">
            <polyline :points="linePoints" fill="none" stroke="#f96bee" stroke-width="2" vector-effect="non-scaling-stroke" />
            <g v-for="(p, i) in linePointArr" :key="i">
              <text :x="p[0]" :y="p[1] - 8" class="line-val" text-anchor="middle">
                {{ fmtWan(stats.byMonth[i].budget) }}
              </text>
              <circle :cx="p[0]" :cy="p[1]" r="3.5" fill="#f96bee" />
            </g>
          </svg>
          <div class="bars-row" :style="{ minWidth: chartMinWidth }">
            <div
              v-for="m in stats.byMonth"
              :key="m.month"
              class="bar-col"
            >
              <div class="bar-wrap">
                <span class="num bar-val">{{ m.count }}</span>
                <div
                  class="bar"
                  :style="{ height: barHeight(m.count) + '%' }"
                  :title="`${m.month}：${m.count} 个`"
                ></div>
              </div>
              <div class="num bar-label">{{ m.month }}</div>
            </div>
          </div>
        </div>
        <div class="chart-legend">
          <span><i class="legend-bar"></i>项目数（个）</span>
          <span><i class="legend-line"></i>立项总金额（万元）</span>
        </div>
      </div>

      <!-- 二、需求部门统计（近两年分别排序展示） -->
      <div class="card demand-card">
        <h3>需求项目统计</h3>
        <div class="demand-grid">
          <div class="demand-col">
            <div class="demand-col-title">{{ stats.demandYears[0] }}年</div>
            <div
              v-for="d in byDemandPrev"
              :key="d.dept"
              class="demand-row"
            >
              <span class="demand-label" :title="d.dept">{{ d.dept }}</span>
              <div class="demand-bar-track">
                <div
                  v-if="d.count > 0"
                  class="demand-bar prev"
                  :style="{ width: demandYearBarWidth(d.count, 'prev') }"
                ></div>
              </div>
              <span class="demand-count-col num">{{ d.count }}</span>
            </div>
          </div>
          <div class="demand-col">
            <div class="demand-col-title">{{ stats.demandYears[1] }}年</div>
            <div
              v-for="d in byDemandCurr"
              :key="d.dept"
              class="demand-row"
            >
              <span class="demand-label" :title="d.dept">{{ d.dept }}</span>
              <div class="demand-bar-track">
                <div
                  v-if="d.count > 0"
                  class="demand-bar curr"
                  :style="{ width: demandYearBarWidth(d.count, 'curr') }"
                ></div>
              </div>
              <span class="demand-count-col num">{{ d.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 三、四、分类与阶段分布 -->
      <div class="grid-2">
        <div class="card dist-card">
          <h3>分类分布</h3>
          <div v-for="c in stats.byCategory" :key="c.category" class="dist-row">
            <span class="dist-name">{{ c.category }}</span>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: pct(c.count) + '%' }"></div>
            </div>
            <span class="num dist-num">{{ c.count }}</span>
            <span class="num dist-pct">{{ pct(c.count) }}%</span>
          </div>
        </div>

        <div class="card dist-card">
          <h3>项目阶段分布</h3>
          <div v-for="s in stats.byStage" :key="s.stage" class="dist-row">
            <span class="dist-name">{{ s.stage }}</span>
            <div class="bar-track">
              <div class="bar-fill stage" :style="{ width: pct(s.count) + '%' }"></div>
            </div>
            <span class="num dist-num">{{ s.count }}</span>
            <span class="num dist-pct">{{ pct(s.count) }}%</span>
          </div>
        </div>
      </div>

      <!-- 五、六：责任人 × 分类 / 责任人 × 阶段，并排等宽等高 -->
      <div class="grid-2 matrix-grid">
        <div class="card matrix-card">
          <h3>责任人 × 分类</h3>
          <table>
            <thead>
              <tr>
                <th>工程责任人</th>
                <th v-for="c in matrixCols" :key="c">{{ c }}</th>
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in stats.byOwnerCategory" :key="o.owner">
                <td>{{ o.owner }}</td>
                <td v-for="c in matrixCols" :key="c" class="num cell-num">
                  <span :class="{ zero: !o[c] }">{{ o[c] || 0 }}</span>
                </td>
                <td class="num cell-num total-cell">{{ o.total }}</td>
              </tr>
              <tr class="sum-row">
                <td>合计</td>
                <td v-for="c in matrixCols" :key="c" class="num cell-num">{{ colSum(c) }}</td>
                <td class="num cell-num total-cell">{{ stats.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card matrix-card">
          <h3>责任人 × 阶段</h3>
          <table>
            <thead>
              <tr>
                <th>工程责任人</th>
                <th v-for="s in stageCols" :key="s">{{ s }}</th>
                <th>合计</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in stats.byOwnerStage" :key="o.owner">
                <td>{{ o.owner }}</td>
                <td v-for="s in stageCols" :key="s" class="num cell-num">
                  <span :class="{ zero: !o[s] }">{{ o[s] || 0 }}</span>
                </td>
                <td class="num cell-num total-cell">{{ o.total }}</td>
              </tr>
              <tr class="sum-row">
                <td>合计</td>
                <td v-for="s in stageCols" :key="s" class="num cell-num">{{ stageColSum(s) }}</td>
                <td class="num cell-num total-cell">{{ stats.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

const stats = ref(null);
const error = ref('');

// 矩阵列：固定 4 分类 + 可选的未分类
const matrixCols = computed(() => {
  if (!stats.value) return [];
  const cols = ['收入相关', '基础能力', '支撑后端', '拟取消'];
  if (stats.value.byOwnerCategory.some((o) => o['未分类'])) cols.push('未分类');
  return cols;
});

// 阶段矩阵列：顺序与后端 byStage 一致（数量降序）
const stageCols = computed(() =>
  stats.value ? stats.value.byStage.map((s) => s.stage) : []
);

function pct(n) {
  if (!stats.value || !stats.value.total) return 0;
  return Math.round((n / stats.value.total) * 1000) / 10;
}

function colSum(c) {
  return stats.value.byOwnerCategory.reduce((s, o) => s + (o[c] || 0), 0);
}

function stageColSum(s) {
  return stats.value.byOwnerStage.reduce((sum, o) => sum + (o[s] || 0), 0);
}

// 柱高按最大值归一（%）
function barHeight(n) {
  const max = Math.max(...stats.value.byMonth.map((m) => m.count), 1);
  return Math.max((n / max) * 100, 3); // 至少 3% 保证可见
}

// 折线图：每月立项金额（万元），SVG 在柱状图上方独立区域，横坐标与柱子一一对应
const chartW = 1000;
const lineH = 110;
// 柱子区域的最小宽度：每柱 44px + 间距 10px；折线 SVG 与柱子同宽，滚动时保持对齐
const chartMinWidth = computed(() =>
  stats.value ? `${stats.value.byMonth.length * 54}px` : '0'
);
const linePointArr = computed(() => {
  if (!stats.value || !stats.value.byMonth.length) return [];
  const months = stats.value.byMonth;
  const maxBudget = Math.max(...months.map((m) => Number(m.budget)), 1);
  const n = months.length;
  return months.map((m, i) => {
    const x = ((i + 0.5) / n) * chartW;
    const y = lineH - 10 - (Number(m.budget) / maxBudget) * (lineH - 36);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  });
});
const linePoints = computed(() => linePointArr.value.map((p) => p.join(',')).join(' '));

// 万元取整展示（如 22723.10 → 22723）
function fmtWan(v) {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
}

// 需求部门统计：近两年分别排序，各自归一化
const byDemandPrev = computed(() => {
  if (!stats.value) return [];
  return stats.value.byDemandDept
    .map((d) => ({ dept: d.dept, count: d.prev }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count || a.dept.localeCompare(b.dept, 'zh'));
});
const byDemandCurr = computed(() => {
  if (!stats.value) return [];
  return stats.value.byDemandDept
    .map((d) => ({ dept: d.dept, count: d.curr }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count || a.dept.localeCompare(b.dept, 'zh'));
});
const demandYearMax = computed(() => {
  if (!stats.value) return { prev: 1, curr: 1 };
  return {
    prev: Math.max(...stats.value.byDemandDept.map((d) => d.prev), 1),
    curr: Math.max(...stats.value.byDemandDept.map((d) => d.curr), 1),
  };
});
function demandYearBarWidth(n, year) {
  return `${(n / demandYearMax.value[year]) * 100}%`;
}

onMounted(async () => {
  try {
    stats.value = await api.getStats();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
/* 项目总数 + 柱状图：冰蓝渐变卡片，与移动蓝柱子同色系 */
.total-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(160deg, #eef6fc 0%, #ffffff 55%);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  padding: 32px;
  margin-bottom: 24px;
}
.total-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 45% 110% at 12% 100%, rgba(0, 133, 208, 0.10), transparent 70%),
    radial-gradient(ellipse 40% 100% at 88% 0%, rgba(51, 163, 220, 0.08), transparent 70%);
}
.total-head {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.total-num {
  font-size: 48px;
  font-weight: 300;
  letter-spacing: -0.96px;
  line-height: 1.15;
  color: var(--ink);
}
.total-label {
  font-size: 13px;
  letter-spacing: 0.1px;
  color: #0085d0;
}

/* 柱状图 + 折线图（折线在上、不重叠；横向滚动时两者同宽对齐） */
.chart {
  position: relative;
  display: flex;
  flex-direction: column;
  margin-top: 28px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.bar-col {
  flex: 1;
  min-width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}
.bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}
.bar-val {
  font-size: 12px;
  color: #0085d0;
}
.bar {
  width: 70%;
  max-width: 44px;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, #33a3dc, #0085d0); /* 中国移动蓝 */
  box-shadow: 0 2px 8px rgba(0, 133, 208, 0.25);
  transition: height 0.6s ease;
}
.bar:hover {
  background: linear-gradient(180deg, #66bef0, #33a3dc);
}
.bar-label {
  font-size: 11px;
  color: var(--ink-mute);
  white-space: nowrap;
  margin-top: 6px;
}

.budget-num { margin-left: 32px; }

/* 折线图区域（柱状图上方，不重叠） */
.chart { position: relative; }
.line-chart {
  display: block;
  width: 100%;
  height: 110px;
  margin-bottom: 4px;
}
.line-val {
  font-size: 11px;
  fill: var(--magenta);
  font-feature-settings: 'tnum';
}
.bars-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 160px;
}
.chart-legend {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-mute);
}
.chart-legend i {
  display: inline-block;
  width: 16px;
  height: 4px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
}
.legend-bar { background: linear-gradient(90deg, #33a3dc, #0085d0); }
.legend-line { background: #f96bee; }

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
}
@media (max-width: 1023px) {
  .grid-2 { grid-template-columns: 1fr; }
}

.dist-card h3, .matrix-card h3 { margin-bottom: 20px; }

.dist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.dist-name {
  width: 96px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--ink-secondary);
}
.bar-track {
  flex: 1;
  height: 8px;
  background: var(--canvas-soft);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--primary), var(--primary-soft));
  transition: width 0.6s ease;
}
.bar-fill.stage {
  background: linear-gradient(90deg, var(--primary-deep), var(--magenta));
}
.dist-num { width: 36px; text-align: right; font-size: 14px; }
.dist-pct { width: 52px; text-align: right; font-size: 13px; color: var(--ink-mute); }

.matrix-card table { width: 100%; }
/* 两个矩阵卡片并排、宽高一致 */
.matrix-grid { align-items: stretch; }
.matrix-grid .matrix-card { height: 100%; box-sizing: border-box; overflow-x: auto; }
.cell-num { text-align: center; }
.cell-num .zero { color: var(--hairline-input); }
.total-cell { font-weight: 400; color: var(--primary-deep); }
.sum-row td {
  border-top: 2px solid var(--hairline);
  font-weight: 400;
  color: var(--ink);
}

/* 需求部门统计：簇状条形图 */
.demand-card { margin-bottom: 24px; }
.demand-card h3 { margin-bottom: 20px; }
.demand-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
@media (max-width: 1023px) {
  .demand-grid { grid-template-columns: 1fr; }
}
.demand-col-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-secondary);
  padding-bottom: 12px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--hairline);
}
.demand-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.demand-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.demand-label {
  width: 160px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.demand-bar-track {
  flex: 1;
  height: 16px;
  background: var(--canvas-soft);
  border-radius: 0 4px 4px 0;
  overflow: hidden;
}
.demand-bar {
  height: 100%;
  border-radius: 0 4px 4px 0;
  transition: width 0.6s ease;
  min-width: 2px;
}
.demand-bar.prev {
  background: linear-gradient(90deg, #8ecae6, #219ebc);
  box-shadow: 0 2px 6px rgba(33, 158, 188, 0.25);
}
.demand-bar.curr {
  background: linear-gradient(90deg, #33a3dc, #0085d0);
  box-shadow: 0 2px 6px rgba(0, 133, 208, 0.25);
}
.demand-count-col {
  width: 32px;
  text-align: right;
  font-size: 14px;
  color: var(--ink);
}
</style>
