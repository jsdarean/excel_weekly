<template>
  <div>
    <nav class="nav">
      <router-link to="/">周报列表</router-link>
      <router-link to="/import">数据导入</router-link>
      <router-link to="/persons">人员配置</router-link>
    </nav>
    <main class="page">
      <router-view />
    </main>
  </div>
</template>

<style>
body { margin: 0; font-family: 'Microsoft YaHei', sans-serif; }
.nav { display: flex; gap: 24px; padding: 12px 24px; background: #1f4e79; }
.nav a { color: #fff; text-decoration: none; }
.nav a.router-link-active { font-weight: bold; border-bottom: 2px solid #fff; }
.page { padding: 16px 24px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f0f4f8; }
button { cursor: pointer; }
</style>
