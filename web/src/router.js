import { createRouter, createWebHistory } from 'vue-router';
import ReportList from './views/ReportList.vue';
import WatchedView from './views/WatchedView.vue';
import ReportView from './views/ReportView.vue';
import StatsView from './views/StatsView.vue';
import ProjectDetail from './views/ProjectDetail.vue';
import ImportView from './views/ImportView.vue';
import PersonsView from './views/PersonsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ReportList },
    { path: '/watched', component: WatchedView },
    { path: '/report', component: ReportView },
    { path: '/stats', component: StatsView },
    { path: '/projects/:code', component: ProjectDetail },
    { path: '/import', component: ImportView },
    { path: '/persons', component: PersonsView },
  ],
});
