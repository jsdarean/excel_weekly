<template>
  <div>
    <h2>人员配置</h2>
    <button @click="openForm(null)">新增人员</button>
    <p v-if="error" class="error">{{ error }}</p>

    <table>
      <thead>
        <tr><th>姓名</th><th>电话</th><th>短号</th><th>邮箱</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in persons" :key="p.id">
          <td>{{ p.name }}</td>
          <td>{{ p.phone }}</td>
          <td>{{ p.short_number }}</td>
          <td>{{ p.email }}</td>
          <td>
            <button @click="openForm(p)">编辑</button>
            <button @click="remove(p)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="editing" class="modal">
      <div class="dialog">
        <h3>{{ editing.id ? '编辑人员' : '新增人员' }}</h3>
        <label>姓名 <input v-model="editing.name" /></label>
        <label>电话 <input v-model="editing.phone" /></label>
        <label>短号 <input v-model="editing.shortNumber" /></label>
        <label>邮箱 <input v-model="editing.email" /></label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <div>
          <button @click="save">保存</button>
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
.error { color: #c00; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.3); display: flex; align-items: center; justify-content: center; }
.dialog { background: #fff; padding: 20px; display: flex; flex-direction: column; gap: 10px; min-width: 320px; }
.dialog label { display: flex; justify-content: space-between; gap: 8px; }
</style>
