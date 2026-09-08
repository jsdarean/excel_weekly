<template>
  <div>
    <h2>通讯录</h2>
    <p class="toolbar">
      <button class="primary" @click="openForm(null)">新增人员</button>
      <select v-model="filterDept" class="filter-select" @change="onDeptChange">
        <option value="">全部部门</option>
        <option v-for="d in departments" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="filterRoom" class="filter-select" :disabled="!filterDept">
        <option value="">全部室</option>
        <option v-for="r in rooms" :key="r" :value="r">{{ r }}</option>
      </select>
      <input v-model="keyword" class="filter-input" placeholder="按姓名搜索" @input="onSearch" />
    </p>
    <p class="hint-tip">通讯录供「项目关联人」录入时检索带出部门、室、电话、邮箱；此处维护的人员与工程责任人相互独立。</p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="card table-card">
      <table>
        <thead>
          <tr><th>部门</th><th>室</th><th>姓名</th><th>职务</th><th>邮箱</th><th>电话</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in persons" :key="p.id">
            <td>{{ p.dept }}</td>
            <td>{{ p.room }}</td>
            <td>{{ p.name }}</td>
            <td>{{ p.title }}</td>
            <td>{{ p.email }}</td>
            <td class="num">{{ p.phone }}</td>
            <td class="ops">
              <button @click="openForm(p)">编辑</button>
              <button @click="remove(p)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!persons.length" class="empty">暂无人员，请点击上方「新增人员」。</p>
    </div>

    <div v-if="editing" class="modal">
      <div class="dialog">
        <h3>{{ editing.id ? '编辑人员' : '新增人员' }}</h3>
        <label>姓名 <input type="text" v-model="editing.name" list="dir-name-options" /></label>
        <datalist id="dir-name-options">
          <option v-for="p in persons" :key="p.id" :value="p.name" />
        </datalist>
        <label>部门 <input type="text" v-model="editing.dept" list="dir-dept-options" placeholder="可从已有部门中选择或直接输入" /></label>
        <datalist id="dir-dept-options">
          <option v-for="d in departments" :key="d" :value="d" />
        </datalist>
        <label>室 <input type="text" v-model="editing.room" list="dir-room-options" placeholder="可从已有室中选择或直接输入" /></label>
        <datalist id="dir-room-options">
          <option v-for="r in editingRooms" :key="r" :value="r" />
        </datalist>
        <label>职务
          <select v-model="editing.title">
            <option value="">（无）</option>
            <option v-for="t in titles" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <label>邮箱 <input type="email" v-model="editing.email" /></label>
        <label>电话 <input type="text" v-model="editing.phone" /></label>
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

const persons = ref([]);
const departments = ref([]);
const rooms = ref([]);
const editingRooms = ref([]);
const filterDept = ref('');
const filterRoom = ref('');
const keyword = ref('');
const editing = ref(null);
const error = ref('');
const formError = ref('');
const titles = ['员工', '室经理', '副总', '总经理'];

async function loadDepartments() {
  try {
    departments.value = (await api.listDirectoryDepartments()).departments;
  } catch {
    // 候选加载失败不影响主流程
  }
}

async function load() {
  try {
    persons.value = (await api.listDirectory({
      dept: filterDept.value,
      room: filterRoom.value,
      q: keyword.value.trim(),
    })).directory;
  } catch (e) {
    error.value = e.message;
  }
}

async function onDeptChange() {
  filterRoom.value = '';
  rooms.value = filterDept.value ? (await api.listDirectoryRooms(filterDept.value)).rooms : [];
  await load();
}

let searchTimer = null;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 300);
}

function openForm(p) {
  formError.value = '';
  editing.value = p
    ? { id: p.id, name: p.name, dept: p.dept ?? '', room: p.room ?? '', title: p.title ?? '', email: p.email ?? '', phone: p.phone ?? '' }
    : { id: null, name: '', dept: filterDept.value, room: filterRoom.value, title: '', email: '', phone: '' };
  // 编辑弹窗里的「室」候选跟随所选部门
  if (editing.value.dept) {
    api.listDirectoryRooms(editing.value.dept).then((r) => (editingRooms.value = r.rooms));
  } else {
    editingRooms.value = [];
  }
}

async function save() {
  formError.value = '';
  try {
    const { id, ...body } = editing.value;
    if (id) await api.updateDirectory(id, body);
    else await api.createDirectory(body);
    editing.value = null;
    await Promise.all([load(), loadDepartments()]);
  } catch (e) {
    formError.value = e.message;
  }
}

async function remove(p) {
  if (!window.confirm(`确认删除通讯录中的「${p.name}」？`)) return;
  try {
    await api.deleteDirectory(p.id);
    await Promise.all([load(), loadDepartments()]);
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadDepartments()]);
});
</script>

<style scoped>
.table-card { padding: 8px 0; }
.toolbar { display: flex; gap: 12px; align-items: center; }
.filter-select, .filter-input {
  padding: 6px 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  font-size: 14px;
}
.filter-input { width: 180px; }
.hint-tip { font-size: 12px; color: var(--ink-mute); margin: 0 0 12px; }
.table-card table { text-align: center; }
.table-card th, .table-card td { text-align: center; }
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
  min-width: 360px;
}
.dialog label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--ink-secondary);
}
.dialog label input,
.dialog label select { flex: 1; }
.dialog-actions { display: flex; gap: 12px; margin-top: 8px; }
</style>
