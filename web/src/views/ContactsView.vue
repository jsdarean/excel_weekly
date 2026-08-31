<template>
  <div>
    <h2>项目关联人</h2>
    <p>
      <button class="primary" @click="openForm(null)">新增关联人</button>
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="card table-card">
      <table>
        <thead>
          <tr>
            <th>项目编码</th><th>项目名称</th>
            <th>部门</th><th>室</th><th>职务</th>
            <th>姓名</th><th>邮箱</th><th>电话</th><th>订阅</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in contacts" :key="c.id">
            <td class="num">{{ c.project_code }}</td>
            <td class="proj-name-cell">
              <div class="tip-wrap">
                <router-link :to="`/projects/${encodeURIComponent(c.project_code)}`">{{ c.project_name }}</router-link>
                <div v-if="c.content" class="tip">{{ c.content }}</div>
              </div>
            </td>
            <td>{{ c.dept }}</td>
            <td>{{ c.room }}</td>
            <td>{{ c.role }}</td>
            <td>{{ c.name }}</td>
            <td>{{ c.email }}</td>
            <td class="num">{{ c.phone }}</td>
            <td>
              <input type="checkbox" :checked="!!c.subscribed" @change="toggleSubscribe(c)" title="是否邮件订阅项目进展" />
            </td>
            <td class="ops">
              <button @click="openForm(c)">编辑</button>
              <button @click="remove(c)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!contacts.length" class="empty">暂无关联人，请点击上方「新增关联人」。</p>
    </div>

    <div v-if="editing" class="modal">
      <div class="dialog">
        <h3>{{ editing.id ? '编辑关联人' : '新增关联人' }}</h3>

        <!-- 新增时搜索选择项目；编辑时项目固定展示 -->
        <template v-if="!editing.id">
          <div class="proj-picker">
            <input
              type="text"
              v-model="keyword"
              placeholder="搜索项目编码 / 项目名称"
              @input="onSearch"
            />
            <div v-if="candidates.length" class="candidates">
              <div
                v-for="c in candidates"
                :key="c.project_code"
                class="candidate"
                @click="pickProject(c)"
              >
                <span class="num">{{ c.project_code }}</span>
                <span>{{ c.project_name }}</span>
                <span class="cand-org">{{ c.demand_dept }} {{ c.demand_room }}</span>
              </div>
            </div>
          </div>
          <p v-if="editing.projectCode" class="picked">
            已选项目：<span class="num">{{ editing.projectCode }}</span> {{ editing.projectName }}
          </p>
        </template>
        <p v-else class="picked">
          项目：<span class="num">{{ editing.projectCode }}</span> {{ editing.projectName }}
        </p>

        <label>部门 <input type="text" v-model="editing.dept" list="dept-options" placeholder="可从已有部门中选择或直接输入" /></label>
        <datalist id="dept-options">
          <option v-for="d in options.depts" :key="d" :value="d" />
        </datalist>
        <label>室 <input type="text" v-model="editing.room" list="room-options" placeholder="可从已有室中选择或直接输入" /></label>
        <datalist id="room-options">
          <option v-for="r in options.rooms" :key="r" :value="r" />
        </datalist>
        <label>职务
          <select v-model="editing.role">
            <option value="">（不填）</option>
            <option value="室经理">室经理</option>
            <option value="员工">员工</option>
          </select>
        </label>
        <label>姓名 <input type="text" v-model="editing.name" /></label>
        <label>邮箱 <input type="email" v-model="editing.email" /></label>
        <label>电话 <input type="text" v-model="editing.phone" /></label>
        <label>邮件订阅 <input type="checkbox" v-model="editing.subscribed" /></label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div class="dialog-actions">
          <button class="primary" @click="save">保存</button>
          <button @click="editing = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../api.js';

const contacts = ref([]);
const editing = ref(null);
const error = ref('');
const formError = ref('');
const keyword = ref('');
const candidates = ref([]);
const options = ref({ depts: [], rooms: [] });

async function load() {
  try {
    contacts.value = (await api.listContacts()).contacts;
  } catch (e) {
    error.value = e.message;
  }
}

function openForm(c) {
  formError.value = '';
  keyword.value = '';
  candidates.value = [];
  editing.value = c
    ? {
        id: c.id,
        projectCode: c.project_code,
        projectName: c.project_name ?? '',
        dept: c.dept ?? '',
        room: c.room ?? '',
        role: c.role ?? '',
        name: c.name ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        subscribed: !!c.subscribed,
      }
    : {
        id: null,
        projectCode: '',
        projectName: '',
        dept: '',
        room: '',
        role: '',
        name: '',
        email: '',
        phone: '',
        subscribed: true,
      };
}

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
    candidates.value = res.rows.slice(0, 10);
  } catch (e) {
    formError.value = e.message;
  }
}

function pickProject(c) {
  editing.value.projectCode = c.project_code;
  editing.value.projectName = c.project_name;
  // 联动带出项目的需求部门/室；含 / 的是多个部门拼接，留空让用户从候选中选一个
  editing.value.dept = c.demand_dept && !c.demand_dept.includes('/') ? c.demand_dept : '';
  editing.value.room = c.demand_room && !c.demand_room.includes('/') ? c.demand_room : '';
  keyword.value = '';
  candidates.value = [];
}

async function save() {
  formError.value = '';
  try {
    const { id, projectName, ...body } = editing.value;
    if (id) await api.updateContact(id, body);
    else await api.createContact(body);
    editing.value = null;
    await load();
  } catch (e) {
    formError.value = e.message;
  }
}

async function toggleSubscribe(c) {
  error.value = '';
  try {
    await api.updateContact(c.id, {
      projectCode: c.project_code,
      dept: c.dept ?? '',
      room: c.room ?? '',
      role: c.role ?? '',
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      subscribed: !c.subscribed,
    });
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(c) {
  if (!window.confirm(`确认删除关联人「${c.name}」（${c.project_name ?? c.project_code}）？`)) return;
  try {
    await api.deleteContact(c.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(async () => {
  await load();
  try {
    options.value = await api.getContactOptions();
  } catch {
    // 候选加载失败不影响主流程
  }
});
</script>

<style scoped>
.table-card { padding: 8px 0; }
.table-card table { text-align: center; }
.table-card th, .table-card td { text-align: center; }
.proj-name-cell { max-width: 200px; }
.proj-name-cell a { color: var(--ink); text-decoration: none; }
.proj-name-cell a:hover { color: var(--primary); }
/* 建设内容悬浮弹窗 */
.tip-wrap { position: relative; display: inline-block; }
.tip {
  display: none;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 6px);
  z-index: 20;
  width: 320px;
  max-height: 240px;
  overflow-y: auto;
  padding: 10px 14px;
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-2);
  font-size: 13px;
  color: var(--ink-secondary);
  text-align: left;
  white-space: pre-wrap;
  word-break: break-all;
}
.tip-wrap:hover .tip { display: block; }
.ops { display: flex; gap: 8px; justify-content: center; }
.empty { text-align: center; color: var(--ink-mute); font-size: 14px; padding: 16px 0; }
.modal {
  position: fixed;
  inset: 0;
  background: rgba(13, 37, 61, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialog {
  background: var(--canvas);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 420px;
}
.dialog label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.dialog label input[type="text"],
.dialog label input[type="email"],
.dialog label select { flex: 1; }
.dialog-actions { display: flex; gap: 12px; margin-top: 8px; }
.proj-picker input { width: 100%; box-sizing: border-box; }
.candidates {
  margin-top: 4px;
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
}
.candidate:hover { background: var(--canvas-soft); }
.cand-org { margin-left: auto; color: var(--ink-mute); font-size: 13px; }
.picked { margin: 0; font-size: 14px; color: var(--ink-secondary); }
</style>
