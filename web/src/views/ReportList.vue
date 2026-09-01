<template>
  <div>
    <h2>项目列表</h2>

    <div class="card filters">
      <label class="search-label">
        <input
          type="text"
          v-model="filters.keyword"
          placeholder="搜索项目编码 / 项目名称 / 需求部门"
          class="search-input"
          @input="onKeywordInput"
        />
      </label>
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
      <span class="filters-spacer"></span>
      <button class="primary" :disabled="!rows.length" @click="onExport">导出 Excel</button>
    </div>

    <p class="mail-hint">有底色的项目为每周批量邮件发送项目进展的项目，请关注周进展。</p>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="!reportDate">暂无数据，请先到「数据导入」页导入 Excel。</p>
    <div
      v-else
      class="card table-card"
      :class="{ dragging: isDragging }"
      @mousedown="onDragStart"
    >
      <table>
        <thead>
          <tr>
            <th class="nowrap sticky" ref="catCol" :style="{ left: '0px' }">专业类别</th>
            <th class="nowrap sticky" ref="codeCol" :style="{ left: lefts.code }">项目编码</th>
            <th class="nowrap sticky last-frozen" :style="[{ left: lefts.name }, nameColStyle]">项目名称</th>
            <th class="nowrap">立项批复日期</th>
            <th class="nowrap">分类</th>
            <th class="nowrap">工程责任人</th>
            <th class="nowrap">立项金额（万元）</th>
            <th class="nowrap">项目阶段</th>
            <th :style="contentColStyle">建设内容</th>
            <th class="nowrap">周进展（{{ reportDate }}）</th>
            <th class="nowrap">请购完成率</th>
            <th class="nowrap">是否交底</th>
            <th class="nowrap">到货完成率</th>
            <th class="nowrap">是否上线交维</th>
            <th class="nowrap">是否竣工验收</th>
            <th class="nowrap" :style="demandColStyle">需求部门</th>
            <th class="nowrap" :style="demandColStyle">需求室</th>
            <th class="nowrap" :style="demandColStyle">需求责任人</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" :class="{ 'mail-on': r.mail_enabled }">
            <td class="nowrap sticky" :style="{ left: '0px' }">{{ r.category_major }}</td>
            <td class="nowrap sticky num" :style="{ left: lefts.code }">{{ r.project_code }}</td>
            <td class="sticky last-frozen" :style="[{ left: lefts.name }, nameColStyle]">
              <div class="name-cell">
                <button
                  class="pin-btn"
                  :class="{ pinned: r.pin_order !== null }"
                  :title="r.pin_order !== null ? '取消置顶' : '置顶（领导关注，排在最前）'"
                  @click="togglePin(r)"
                >{{ r.pin_order !== null ? '★' : '☆' }}</button>
                <template v-if="r.pin_order !== null">
                  <button class="pin-move" title="上移" @click="movePin(r, 'up')">↑</button>
                  <button class="pin-move" title="下移" @click="movePin(r, 'down')">↓</button>
                </template>
                <router-link class="proj-link" :to="`/projects/${encodeURIComponent(r.project_code)}`">
                  <span class="clip" @mouseenter="showTip($event, r.project_name)" @mouseleave="hideTip">{{ r.project_name }}</span>
                </router-link>
              </div>
            </td>
            <td class="nowrap num">{{ r.approval_date }}</td>
            <td class="nowrap">{{ r.category }}</td>
            <td class="nowrap">{{ r.owner }}</td>
            <td class="nowrap num">{{ r.budget_wan }}</td>
            <td class="nowrap">{{ r.stage }}</td>
            <td :style="contentColStyle"><span class="clip" @mouseenter="showTip($event, r.content)" @mouseleave="hideTip">{{ r.content }}</span></td>
            <td :style="contentColStyle"><span class="clip" @mouseenter="showTip($event, r.progress)" @mouseleave="hideTip">{{ r.progress }}</span></td>
            <td class="nowrap num">{{ fmtRate(r.purchase_rate) }}</td>
            <td class="nowrap">{{ r.disclosure }}</td>
            <td class="nowrap num">{{ fmtRate(r.arrival_rate) }}</td>
            <td class="nowrap">{{ r.online_handover }}</td>
            <td class="nowrap">{{ r.final_acceptance }}</td>
            <td class="nowrap" :style="demandColStyle">
              <span class="clip" @mouseenter="showTip($event, r.demand_dept)" @mouseleave="hideTip">{{ r.demand_dept }}</span>
            </td>
            <td class="nowrap" :style="demandColStyle">
              <span class="clip" @mouseenter="showTip($event, r.demand_room)" @mouseleave="hideTip">{{ r.demand_room }}</span>
            </td>
            <td class="nowrap" :style="demandColStyle">
              <span class="clip" @mouseenter="showTip($event, r.demand_owner)" @mouseleave="hideTip">{{ r.demand_owner }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tip.visible" class="hover-tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { api } from '../api.js';
import { exportReports } from '../exportExcel.js';

const dates = ref([]);
const options = reactive({ categories: [], owners: [], stages: [] });
const filters = reactive({ keyword: '', report_date: '', category: '', owner: '', stage: '' });
const rows = ref([]);
const reportDate = ref('');
const error = ref('');

async function onExport() {
  try {
    await exportReports(rows.value, reportDate.value);
  } catch (e) {
    error.value = `导出失败：${e.message}`;
  }
}

// 置顶 / 取消置顶 / 调整置顶顺序（置顶项目排在列表及导出最前）
async function togglePin(r) {
  error.value = '';
  try {
    if (r.pin_order !== null && r.pin_order !== undefined) {
      await api.unpinProject(r.project_code);
    } else {
      await api.pinProject(r.project_code);
    }
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function movePin(r, direction) {
  error.value = '';
  try {
    await api.movePin(r.project_code, direction);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// 悬停浮层：fixed 定位，不受表格滚动容器裁剪
const tip = reactive({ visible: false, text: '', x: 0, y: 0 });
function showTip(e, text) {
  if (!text) return;
  // 仅在文本确实被截断时显示
  const el = e.currentTarget;
  if (el.scrollWidth <= el.clientWidth) return;
  const rect = el.getBoundingClientRect();
  tip.text = text;
  tip.x = Math.min(rect.left, window.innerWidth - 500);
  tip.y = rect.bottom + 4;
  tip.visible = true;
}
function hideTip() {
  tip.visible = false;
}

// 冻结前三级列（专业类别/项目编码/项目名称）；列宽内容自适应，偏移量渲染后实测
const catCol = ref(null);
const codeCol = ref(null);
const colWidths = reactive({ cat: 0, code: 0 });
const lefts = computed(() => ({
  code: `${colWidths.cat}px`,
  name: `${colWidths.cat + colWidths.code}px`,
}));

// 项目名称列宽 = 项目编码列宽的 2 倍，超出省略 + 悬停弹窗；建设内容列宽与项目名称一致
const nameColStyle = computed(() =>
  colWidths.code
    ? { width: `${colWidths.code * 2}px`, maxWidth: `${colWidths.code * 2}px` }
    : {}
);
const contentColStyle = nameColStyle;
// 需求部门/需求室/需求责任人：列宽与项目编码保持一致
const demandColStyle = computed(() =>
  colWidths.code
    ? { width: `${colWidths.code}px`, maxWidth: `${colWidths.code}px` }
    : {}
);

async function syncColWidths() {
  await nextTick();
  if (catCol.value) colWidths.cat = catCol.value.offsetWidth;
  if (codeCol.value) colWidths.code = codeCol.value.offsetWidth;
}

// 拖动滚动（横向 + 纵向）
const isDragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let dragStartScrollLeft = 0;
let dragStartScrollTop = 0;

function onDragStart(e) {
  const el = e.currentTarget;
  isDragging.value = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartScrollLeft = el.scrollLeft;
  dragStartScrollTop = el.scrollTop;
  const onMove = (ev) => {
    el.scrollLeft = dragStartScrollLeft - (ev.clientX - dragStartX);
    el.scrollTop = dragStartScrollTop - (ev.clientY - dragStartY);
  };
  const onUp = () => {
    isDragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function fmtRate(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : v;
}

// 搜索输入防抖（300ms）
let searchTimer = null;
function onKeywordInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
}

async function load() {
  error.value = '';
  try {
    const res = await api.getReports({ ...filters });
    rows.value = res.rows;
    reportDate.value = res.reportDate;
    await syncColWidths();
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
.filters {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  padding: 16px 24px;
}
.filters label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.search-input { width: 240px; }
.filters-spacer { flex: 1; }

/* 表格容器：横向/纵向滚动 + 拖动；纵向滚动时表头冻结 */
.table-card {
  padding: 0;
  overflow: auto;
  max-height: calc(100vh - 260px);
  cursor: grab;
  user-select: none;
}
.table-card.dragging { cursor: grabbing; }
.table-card table { width: max-content; min-width: 100%; }

/* 表头纵向冻结：加高行高，盖住滚动露出的内容 */
.table-card th {
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--hairline);
  padding: 14px 12px;
}

.nowrap { white-space: nowrap; }

/* 冻结列：横向滚动时保持不动，需实底背景盖住滚过的内容 */
.sticky {
  position: sticky;
  background: var(--canvas);
  z-index: 2;
}
th.sticky { z-index: 5; }
tbody tr:hover td.sticky { background: var(--canvas-soft); }
/* 冻结区右缘分隔线 */
.last-frozen { box-shadow: 1px 0 0 var(--hairline); }

/* 批量邮件发送项目：显目底色（需覆盖冻结列的实底背景与悬停态） */
tbody tr.mail-on td { background: #fff3d6; }
tbody tr.mail-on td.sticky { background: #fff3d6; }
tbody tr.mail-on:hover td,
tbody tr.mail-on:hover td.sticky { background: #ffe9b8; }

/* 备注：批量邮件项目说明 */
.mail-hint { font-size: 13px; color: var(--ink-mute); margin: 0 0 8px; }

/* 省略单元格：悬停浮层由 JS 驱动（.hover-tip），此处只负责单行省略 */
.clip {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hover-tip {
  position: fixed;
  z-index: 100;
  background: var(--ink);
  color: var(--on-primary);
  font-size: 13px;
  line-height: 1.5;
  padding: 12px 16px;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-2);
  white-space: pre-wrap;
  max-width: 480px;
  min-width: 240px;
  pointer-events: none;
}

/* 项目名称链接 */
.proj-link { text-decoration: none; color: var(--ink); }
.proj-link:hover { color: var(--primary); }

/* 置顶按钮与调序按钮（项目名称单元格内） */
.name-cell { display: flex; align-items: center; gap: 2px; }
.name-cell .proj-link { flex: 1; min-width: 0; }
.pin-btn,
.pin-move {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0 2px;
  font-size: 13px;
  line-height: 1;
  color: var(--ink-secondary);
  opacity: 0.5;
}
.pin-btn:hover,
.pin-move:hover { opacity: 1; color: var(--primary); }
.pin-btn.pinned { color: #f0a020; opacity: 1; }
.pin-move { font-size: 12px; }
</style>
