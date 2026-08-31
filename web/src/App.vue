<template>
  <div>
    <nav class="nav">
      <span class="brand">工程周报管理</span>
      <router-link to="/">项目列表</router-link>
      <router-link to="/watched">关注项目</router-link>
      <router-link to="/report">周报管理</router-link>
      <router-link to="/stats">项目统计</router-link>
      <router-link to="/import">数据导入</router-link>
      <router-link to="/persons">人员配置</router-link>
      <router-link to="/contacts">项目关联人</router-link>
      <router-link to="/email-config">邮箱配置</router-link>
    </nav>
    <main class="page">
      <router-view />
    </main>
  </div>
</template>

<style>
/* 全局令牌与组件样式在 styles.css 中（main.js 引入） */

/* 导航：渐变 mesh 背景（奶油→橙→薰衣草→靛蓝→宝石红） */
.nav {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--hairline);
  background:
    radial-gradient(ellipse 40% 160% at 8% 50%, rgba(245, 233, 212, 0.9) 0%, transparent 70%),
    radial-gradient(ellipse 35% 150% at 30% 40%, rgba(240, 178, 122, 0.55) 0%, transparent 70%),
    radial-gradient(ellipse 35% 160% at 55% 60%, rgba(185, 185, 249, 0.55) 0%, transparent 75%),
    radial-gradient(ellipse 40% 170% at 78% 45%, rgba(102, 94, 253, 0.45) 0%, transparent 70%),
    radial-gradient(ellipse 30% 150% at 95% 55%, rgba(234, 34, 97, 0.4) 0%, transparent 65%),
    linear-gradient(90deg, #f5e9d4, #b9b9f9 55%, #f96bee);
}
.nav .brand {
  font-size: 18px;
  font-weight: 400;
  color: var(--ink);
  letter-spacing: -0.2px;
  margin-right: 16px;
}
.nav a {
  color: var(--ink-secondary);
  text-decoration: none;
  font-size: 15px;
  padding: 4px 2px;
}
.nav a:hover { color: var(--ink); }
.nav a.router-link-active {
  color: var(--primary-press);
  border-bottom: 2px solid var(--primary-press);
}

.page {
  max-width: 1600px;
  margin: 0 auto;
  padding: 24px;
}
</style>
