import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style/main.css'
import App from './App.vue'
import router from './router'
import { initializeMermaid } from "./utils/markdown/mermaid-render";
const app = createApp(App)

app.use(createPinia())
app.use(router)

// 在Pinia初始化后初始化mermaid
initializeMermaid();

app.mount('#app')
