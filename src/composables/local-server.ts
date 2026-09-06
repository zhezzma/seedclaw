/**
 * 内置服务端（bundled seedagent）状态桥。
 * Rust 侧 server.rs 通过 server://status 事件推送，前端启动时 invoke server_status 拉取一次
 * （reload 后会错过早期事件，必须主动拉）。
 */
import { reactive } from 'vue'
import { useUiSettingsStore } from '../stores/setting'
import { isTauri } from './notify-server-connection'

export interface ServerStatus {
    bundled: boolean
    state: 'starting' | 'running' | 'restarting' | 'failed' | 'unavailable'
    port: number | null
    url: string | null
    token: string | null
    pid: number | null
    lastError: string | null
    dataDir: string | null
}

export const localServer: ServerStatus = reactive({
    bundled: false,
    state: 'unavailable',
    port: null,
    url: null,
    token: null,
    pid: null,
    lastError: null,
    dataDir: null,
})

/** 模式守卫：未打包服务端的构建（Android/Web/dev 未 staging）强制 remote。 */
export function effectiveGatewayMode(): 'local' | 'remote' {
    if (!localServer.bundled) return 'remote'
    const settings = useUiSettingsStore()
    return settings.gatewayMode === 'local' ? 'local' : 'remote'
}

/** local 模式下把 Rust 侧托管地址写进 settings（消费方 api-client/notify 等零改动）。 */
function syncSettings() {
    const settings = useUiSettingsStore()
    if (effectiveGatewayMode() !== 'local') return
    if (!localServer.url || !localServer.token) return
    if (settings.apiBaseUrl !== localServer.url || settings.token !== localServer.token) {
        settings.apiBaseUrl = localServer.url
        settings.token = localServer.token
        settings.persist()
    }
}

function applyStatus(s: Partial<ServerStatus>) {
    Object.assign(localServer, s)
    if (localServer.state === 'running') everRunning = true
    syncSettings()
}

/** 本次页面会话中服务端是否至少 Running 过一次（之后的崩溃重启不再挡 UI，走既有容错）。 */
let everRunning = false

/** local 模式下服务端是否仍在初始启动窗口内（ bundled 且从未 Running 过）。 */
export function isLocalServerBooting(): boolean {
    if (!isTauri || !localServer.bundled) return false
    if (effectiveGatewayMode() !== 'local') return false
    if (everRunning) return false
    return localServer.state === 'starting' || localServer.state === 'restarting'
}

/** 初始启动失败（从未 Running 过）：由启动失败界面接管；运行后崩溃走既有容错不挡 UI。 */
export function isLocalServerBootFailed(): boolean {
    if (!isTauri || !localServer.bundled) return false
    if (effectiveGatewayMode() !== 'local') return false
    return !everRunning && localServer.state === 'failed'
}

/** 等待内置服务端离开初始启动窗口（Running 或 Failed）；非 local 模式立即返回。 */
export async function waitForLocalServerReady(): Promise<void> {
    while (isLocalServerBooting()) {
        await new Promise((r) => setTimeout(r, 150))
    }
}

let loaded = false
let loadPromise: Promise<void> | null = null

/** 幂等初始化：拉一次状态 + 订阅事件。非 Tauri 环境立即完成。 */
export function ensureLocalServerLoaded(): Promise<void> {
    if (loaded) return Promise.resolve()
    if (loadPromise) return loadPromise
    if (!isTauri) {
        loaded = true
        return Promise.resolve()
    }
    loadPromise = (async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const { listen } = await import('@tauri-apps/api/event')
            await listen<Partial<ServerStatus>>('server://status', (event) => {
                // Rust 侧字段是 snake_case（last_error/data_dir）
                const p = event.payload as any
                applyStatus({
                    bundled: p.bundled,
                    state: p.state,
                    port: p.port ?? null,
                    url: p.url ?? null,
                    token: p.token ?? null,
                    pid: p.pid ?? null,
                    lastError: p.last_error ?? p.lastError ?? null,
                    dataDir: p.data_dir ?? null,
                })
            })
            const initial = await invoke<any>('server_status')
            applyStatus({
                bundled: initial.bundled,
                state: initial.state,
                port: initial.port ?? null,
                url: initial.url ?? null,
                token: initial.token ?? null,
                pid: initial.pid ?? null,
                lastError: initial.last_error ?? null,
                dataDir: initial.data_dir ?? null,
            })
            loaded = true
        } catch (e) {
            console.error('[local-server] failed to load status:', e)
            loaded = true
        }
    })()
    return loadPromise
}

export async function restartLocalServer(): Promise<void> {
    if (!isTauri) return
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('server_restart')
}
