import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style/main.css'
import App from './App.vue'
import router from './router'
import { initializeMermaid } from "./utils/markdown/mermaid-render";
import { i18n } from "./i18n";
import { parseTunnelHash, applyTunnelBootstrap, stripHashFromUrl } from './utils/tunnel-hash'
import { useUiSettingsStore } from './stores/setting'
import { isTauri } from './composables/notify-server-connection'


const app = createApp(App)
app.use(i18n)
app.use(createPinia())

// 隧道移动端引导：必须在 router/mount 之前完成——任何组件 setup 期的 API 调用
// （api-client.getBaseUrl() 在 apiBaseUrl 为空时直接 throw）都依赖 settings 已写入。
// pinia install 后即可在组件外使用 store。
// 仅浏览器环境执行：Tauri 客户端（桌面/Android）不会也不应被 #token 引导触碰
//（否则 origin 是 tauri:// 伪协议，会写坏 apiBaseUrl）。
try {
    const bootstrap = !isTauri ? parseTunnelHash(window.location.hash) : null
    if (bootstrap) {
        applyTunnelBootstrap(useUiSettingsStore(), window.location.origin, bootstrap)
        history.replaceState(null, '', stripHashFromUrl(window.location.href))
    }
} catch (e) {
    console.error('[tunnel] hash bootstrap failed:', e)
}

app.use(router)

// 在Pinia初始化后初始化mermaid
initializeMermaid();

app.mount('#app')
