<template>
  <div>
    <h2>人员配置</h2>
    <p>
      <button class="primary" @click="openForm(null)">新增人员</button>
    </p>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="card table-card">
      <table>
        <thead>
          <tr><th>姓名</th><th>电话</th><th>短号</th><th>邮箱</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in persons" :key="p.id">
            <td>{{ p.name }}</td>
            <td class="num">{{ p.phone }}</td>
            <td class="num">{{ p.short_number }}</td>
            <td>{{ p.email }}</td>
            <td class="ops">
              <button @click="openForm(p)">编辑</button>
              <button @click="remove(p)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="modal">
      <div class="dialog">
        <h3>{{ editing.id ? '编辑人员' : '新增人员' }}</h3>
        <label>姓名 <input type="text" v-model="editing.name" /></label>
        <label>电话 <input type="text" v-model="editing.phone" /></label>
        <label>短号 <input type="text" v-model="editing.shortNumber" /></label>
        <label>邮箱 <input type="email" v-model="editing.email" /></label>
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
const editing = ref(null);
const error = ref('');
const formError = ref('');

async function load() {
  try {
    persons.value = (await api.listPersons()).persons;
  } catch (e) {
    error.value = e.message;
  }
}

function openForm(p) {
  formError.value = '';
  editing.value = p
    ? { id: p.id, name: p.name, phone: p.phone ?? '', shortNumber: p.short_number ?? '', email: p.email ?? '' }
    : { id: null, name: '', phone: '', shortNumber: '', email: '' };
}

async function save() {
  formError.value = '';
  try {
    const { id, ...body } = editing.value;
    if (id) await api.updatePerson(id, body);
    else await api.createPerson(body);
    editing.value = null;
    await load();
  } catch (e) {
    formError.value = e.message;
  }
}

async function remove(p) {
  if (!window.confirm(`确认删除「${p.name}」？`)) return;
  try {
    await api.deletePerson(p.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<style scoped>
.table-card { padding: 8px 0; }
.table-card table { text-align: center; }
.table-card th, .table-card td { text-align: center; }
.ops { display: flex; gap: 8px; justify-content: center; }
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
.dialog label input { flex: 1; }
.dialog-actions { display: flex; gap: 12px; margin-top: 8px; }
</style>
