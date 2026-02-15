import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const basePath = import.meta.env.BASE_URL || '/draw-editor/'
if (import.meta.env.PROD && window.location.pathname === '/' && basePath !== '/') {
  window.location.replace(basePath)
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
