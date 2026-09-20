/**
 * 内置服务端（bundled seedagent）状态桥。
 * Rust 侧 server.rs 通过 server://status 事件推送，前端启动时 invoke server_status 拉取一次
 * （reload 后会错过早期事件，必须主动拉）。
 */
import { reactive } from 'vue'
import { useUiSettingsStore, LOCAL_GATEWAY_ID } from '../stores/setting.ts'
import { gatewaySwitchTargetUrl } from '../utils/route-helpers'
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
    return settings.activeGateway?.type === 'local' ? 'local' : 'remote'
}

/** local 模式下把 Rust 侧托管地址写进 settings（消费方 api-client/notify 等零改动）。 */
function syncSettings() {
    const settings = useUiSettingsStore()
    if (effectiveGatewayMode() !== 'local') return
    if (!localServer.url || !localServer.token) return
    // 顶层生效值 + local 条目镜像双写：reload 后恢复托管连接靠的是顶层值
    // （loadConfig 对 local 激活条目读顶层值，不读条目），条目仅为账号模型副本，
    // 两处必须同写，switchGateway 也复用本函数完成双写
    const localEntry = settings.gateways.find((g) => g.id === LOCAL_GATEWAY_ID)
    if (settings.apiBaseUrl !== localServer.url || settings.token !== localServer.token
        || localEntry?.apiBaseUrl !== localServer.url || localEntry?.token !== localServer.token) {
        settings.apiBaseUrl = localServer.url
        settings.token = localServer.token
        settings.updateGateway(LOCAL_GATEWAY_ID, { apiBaseUrl: localServer.url, token: localServer.token })
    }
}

function applyStatus(s: Partial<ServerStatus>) {
    Object.assign(localServer, s)
    if (localServer.state === 'running') everRunning = true
    // local 条目保活/自洁：bundled 构建确保有托管条目可切；未打包构建剔除
    // （store 迁移时会建 local 条目，Web/Android 上留着会污染账号菜单）
    useUiSettingsStore().reconcileLocalGateway(localServer.bundled)
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
        // 纯 Web 构建没有内嵌服务端，applyStatus 的事件/invoke 路径永远不跑，
        // 迁移时无条件创建的 local 空壳条目必须在这里主动剔除，
        // 否则幽灵行永久残留（激活它会被 effectiveGatewayMode 强制降级 remote）
        useUiSettingsStore().reconcileLocalGateway(false)
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

/**
 * 切换网关账号的前置守卫：返回阻止原因的 i18n key，或 null 表示放行。
 * local 未就绪（failed/无 url/token）不放行——否则 reload 后直接落到启动失败页；
 * remote 条目没填地址不放行。侧边栏菜单与设置页共用，防止两处守卫漂移。
 */
export function gatewaySwitchBlockReason(entry: { type: 'local' | 'remote'; apiBaseUrl: string }):
    'sidebar.localServerNotReady' | 'sidebar.remoteNotConfigured' | null {
    if (entry.type === 'local') {
        return localServer.state === 'failed' || !localServer.url || !localServer.token
            ? 'sidebar.localServerNotReady'
            : null
    }
    return entry.apiBaseUrl.trim() ? null : 'sidebar.remoteNotConfigured'
}

/**
 * 切换网关账号并整页 reload（侧边栏账号菜单与设置页共用）。
 * - 激活目标条目：remote 条目顶层值由 setActiveGateway 同步；local 条目若内置
 *   服务端已有地址，立即写入 apiBaseUrl/token——否则 reload 后 App 启动抢跑的
 *   数据加载会先用旧远程值拉数据，出现"刷新后仍显示远程数据、需再手动刷新"的问题。
 * reload 前若路由停在 /chat/<sessionKey>，先改写到 /new：各服务器会话互不相通，
 * 保留旧 key 会让 reload 后的路由指向对端不存在的会话。
 * file: 协议分支不 reload 也不改写：保持 URL 与路由状态一致（该分支在
 * Tauri v2 实际不可达，属遗留防御，勿单独给 file: 加 replaceState）。
 */
export function switchGateway(id: string) {
    const settings = useUiSettingsStore()
    if (!settings.gateways.some((g) => g.id === id)) return
    settings.setActiveGateway(id)
    // local 条目的「顶层+条目」双写统一收敛到 syncSettings：前置守卫
    // （gatewaySwitchBlockReason）已保证切 local 时 localServer.url/token 就绪；
    // remote 条目在 setActiveGateway 内已同步生效值，此处对其是 no-op
    syncSettings()
    if (window.location.protocol !== 'file:') {
        const targetUrl = gatewaySwitchTargetUrl(window.location.pathname)
        if (targetUrl) {
            // 同步改写地址后立即 reload：vue-router 状态不需要（也来不及）同步；
            // try 防御极端 webview 抛异常，确保后面的 reload 仍能执行
            try {
                history.replaceState(null, '', targetUrl)
            } catch {
                // 忽略：最坏情况是 reload 后仍停在旧 /chat/<key>
            }
        }
        window.location.reload()
    }
}
