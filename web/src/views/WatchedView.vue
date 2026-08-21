<template>
  <div>
    <h2>关注项目</h2>

    <!-- 搜索新增关注 -->
    <div class="card search-card">
      <div class="search-row">
        <input
          type="text"
          v-model="keyword"
          placeholder="搜索项目编码 / 项目名称，回车或点击候选添加关注"
          class="search-input"
          @input="onSearch"
          @focus="keyword && search()"
        />
      </div>
      <div v-if="candidates.length" class="candidates">
        <div
          v-for="c in candidates"
          :key="c.project_code"
          class="candidate"
          @click="addWatch(c.project_code)"
        >
          <span class="num">{{ c.project_code }}</span>
          <span>{{ c.project_name }}</span>
          <span class="cand-cat">{{ c.category }}</span>
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <!-- 分类卡片 -->
    <div v-for="card in cards" :key="card.category" class="card cat-card">
      <h3 class="cat-title">
        {{ card.category }}
        <span class="cat-stats num">
          （{{ card.total }}个项目，占比{{ card.pct }}%，立项总金额{{ card.budgetYi }}亿元）
        </span>
      </h3>

      <div v-for="(p, pi) in card.projects" :key="p.project_code">
          <hr v-if="pi > 0" class="proj-sep" />
          <div class="proj">
            <div class="proj-head">
              <span class="num proj-code">{{ p.project_code }}</span>
              <router-link class="proj-name" :to="`/projects/${encodeURIComponent(p.project_code)}`">{{ p.project_name }}</router-link>
              <button class="unwatch" @click="unwatch(p.project_code)">取消关注</button>
            </div>

            <!-- 时间轴 -->
            <div class="timeline">
              <div v-for="entry in p.progress" :key="entry.id" class="tl-item">
                <div class="tl-dot"></div>
                <div class="tl-body">
                  <div v-if="editingId === entry.id" class="tl-edit">
                    <input type="date" v-model="editForm.report_date" />
                    <textarea v-model="editForm.detail" rows="3"></textarea>
                    <div class="tl-actions">
                      <button class="primary" @click="saveEdit(entry.id)">保存</button>
                      <button @click="editingId = null">取消</button>
                    </div>
                  </div>
                  <template v-else>
                    <div class="tl-main">
                      <div class="tl-text">
                        <div class="tl-date num">{{ entry.report_date }}</div>
                        <div class="tl-detail">{{ entry.detail }}</div>
                      </div>
                      <div class="tl-actions">
                        <button class="link-btn" @click="startEdit(entry)">编辑</button>
                        <button class="link-btn danger" @click="removeProgress(entry.id)">删除</button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <!-- 新增进展 -->
              <div v-if="addingFor === p.project_code" class="tl-item">
                <div class="tl-dot new"></div>
                <div class="tl-body">
                  <div class="tl-edit">
                    <input type="date" v-model="addForm.report_date" />
                    <textarea v-model="addForm.detail" rows="3" placeholder="录入该周的详细进展"></textarea>
                    <div class="tl-actions">
                      <button class="primary" @click="saveAdd(p.project_code)">保存</button>
                      <button @click="addingFor = null">取消</button>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="add-row">
                <button class="add-progress" @click="startAdd(p.project_code)">+ 录入进展</button>
              </div>
            </div>
          </div>
        </div>
    </div>
    <p v-if="stats && !cards.length" class="empty">暂无关注项目，请通过上方搜索添加。</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

const CATEGORY_ORDER = ['收入相关', '基础能力', '支撑后端', '拟取消'];

const keyword = ref('');
const candidates = ref([]);
const watched = ref([]);
const stats = ref(null);
const error = ref('');
const editingId = ref(null);
const editForm = ref({ report_date: '', detail: '' });
const addingFor = ref(null);
const addForm = ref({ report_date: '', detail: '' });

let searchTimer = null;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(search, 300);
}

async function search() {
  const kw = keyword.value.trim();
  if (!kw) {
    candidates.value = [];
    return;
  }
  try {
    const res = await api.searchProjects(kw);
    const watchedCodes = new Set(watched.value.map((w) => w.project_code));
    candidates.value = res.rows
      .filter((r) => !watchedCodes.has(r.project_code))
      .slice(0, 10);
  } catch (e) {
    error.value = e.message;
  }
}

async function load() {
  const [w, s] = await Promise.all([api.getWatched(), api.getStats()]);
  watched.value = w.watched;
  stats.value = s;
}

async function addWatch(code) {
  error.value = '';
  try {
    await api.addWatched(code);
    keyword.value = '';
    candidates.value = [];
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function unwatch(code) {
  if (!window.confirm('取消关注将同时删除该项目的详细进展记录，确认？')) return;
  try {
    await api.removeWatched(code);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

function startAdd(code) {
  addingFor.value = code;
  addForm.value = { report_date: '', detail: '' };
  editingId.value = null;
}

async function saveAdd(code) {
  error.value = '';
  try {
    await api.addWatchProgress(code, addForm.value);
    addingFor.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

function startEdit(entry) {
  editingId.value = entry.id;
  editForm.value = { report_date: entry.report_date, detail: entry.detail };
  addingFor.value = null;
}

async function saveEdit(id) {
  error.value = '';
  try {
    await api.updateWatchProgress(id, editForm.value);
    editingId.value = null;
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function removeProgress(id) {
  if (!window.confirm('确认删除该条进展记录？')) return;
  try {
    await api.deleteWatchProgress(id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

// 卡片：固定 3 分类 + 有关注项目的其他分类；只展示有关注项目的卡片
const cards = computed(() => {
  if (!stats.value) return [];
  const totalAll = stats.value.total || 1;
  const statByCat = new Map(stats.value.byCategory.map((c) => [c.category, c]));
  const watchedByCat = new Map();
  for (const w of watched.value) {
    const cat = w.category || '未分类';
    if (!watchedByCat.has(cat)) watchedByCat.set(cat, []);
    watchedByCat.get(cat).push(w);
  }
  const catSet = new Set([...CATEGORY_ORDER, ...watchedByCat.keys()]);
  return [...catSet]
    .filter((cat) => watchedByCat.has(cat))
    .map((cat) => {
      const st = statByCat.get(cat);
      return {
        category: cat,
        total: st ? st.count : 0,
        pct: st ? Math.round((st.count / totalAll) * 1000) / 10 : 0,
        budgetYi: st ? (Number(st.budget) / 10000).toFixed(2) : '0.00',
        projects: watchedByCat.get(cat) || [],
      };
    });
});

onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<style scoped>
.search-card { margin-bottom: 24px; }
.search-input { width: 100%; box-sizing: border-box; }
.candidates {
  margin-top: 8px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  overflow: hidden;
}
.candidate {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  align-items: center;
}
.candidate:hover { background: var(--canvas-soft); }
.cand-cat { margin-left: auto; color: var(--ink-mute); font-size: 13px; }

.cat-card { margin-bottom: 24px; }
.cat-title { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
.cat-stats { font-size: 13px; color: var(--ink-mute); font-weight: 300; letter-spacing: 0; }
.empty { color: var(--ink-mute); font-size: 14px; }

.proj-sep { border: none; border-top: 1px dashed var(--hairline); margin: 20px 0; }
.proj-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.proj-code { font-size: 13px; color: var(--ink-mute); }
.proj-name { font-size: 16px; color: var(--ink); text-decoration: none; font-weight: 400; }
.proj-name:hover { color: var(--primary); }
.unwatch { margin-left: auto; font-size: 12px; padding: 4px 12px; }

/* 时间轴 */
.timeline { position: relative; padding-left: 20px; }
.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--hairline);
}
.tl-item { position: relative; padding-bottom: 16px; }
.tl-dot {
  position: absolute;
  left: -20px;
  top: 6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--canvas);
  border: 3px solid var(--primary);
}
.tl-dot.new { border-color: var(--ink-mute); }
.tl-date { font-size: 13px; color: var(--primary-deep); margin-bottom: 4px; }
.tl-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.tl-text { flex: 1; min-width: 0; }
.tl-detail { font-size: 14px; white-space: pre-wrap; }
.tl-edit { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
.tl-edit textarea {
  font-family: inherit;
  font-size: 14px;
  padding: 8px 12px;
  border: 1px solid var(--hairline-input);
  border-radius: var(--r-sm);
  resize: vertical;
}
.tl-edit textarea:focus { outline: none; border-color: var(--primary); }
.tl-actions { display: flex; gap: 12px; flex-shrink: 0; }
.tl-edit .tl-actions { margin-top: 4px; justify-content: flex-end; }
.link-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  color: var(--primary);
}
.link-btn:hover { text-decoration: underline; background: none; }
.link-btn.danger { color: var(--ruby); }
.add-row { display: flex; justify-content: flex-end; }
.add-progress {
  border: 1px dashed var(--hairline-input);
  color: var(--ink-mute);
  background: none;
  font-size: 13px;
  padding: 6px 14px;
}
.add-progress:hover { color: var(--primary); border-color: var(--primary); }
</style>
