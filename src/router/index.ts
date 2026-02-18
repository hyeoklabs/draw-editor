import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import BView from '../views/BView.vue'
import CView from '../views/CView.vue'
import DView from '../views/DView.vue'

const routerBase = import.meta.env.BASE_URL || '/draw-editor/'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: '/b',
    name: 'b',
    component: BView,
  },
  {
    path: '/c',
    name: 'c',
    component: CView,
  },
  {
    path: '/d',
    name: 'd',
    component: DView,
  },
]

const router = createRouter({
  history: createWebHistory(routerBase),
  routes,
})

export default router
