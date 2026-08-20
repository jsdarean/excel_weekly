import { createRouter, createWebHistory } from 'vue-router';
import ReportList from './views/ReportList.vue';
import ImportView from './views/ImportView.vue';
import PersonsView from './views/PersonsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ReportList },
    { path: '/import', component: ImportView },
    { path: '/persons', component: PersonsView },
  ],
});
