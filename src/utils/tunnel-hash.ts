/**
 * 移动端隧道 hash 引导。
 *
 * PC 端 tunnel 面板二维码内容：http://<vps-ip>:<port>/#token=<访问令牌>
 * 手机扫码打开后，前端启动时（main.ts，早于任何 API 调用）解析 hash：
 *   - 有 token → upsert remote 网关条目并激活（apiBaseUrl = window.location.origin，同源服务端；
 *     注意 api-client.getBaseUrl() 在 apiBaseUrl 为空时直接 throw，必须先写入）
 *   - 抹掉 hash（history.replaceState），避免令牌留在地址栏/历史记录
 *   - setupDone = true 跳过首次引导向导，直接进 UI
 */
import { gatewayHostLabel } from './gateway-url.ts'

export interface TunnelHashBootstrap {
    token: string
}

/**
 * 解析 hash 中的隧道引导参数。
 * 支持格式：#token=xxx（及未来可能的 & 其他参数）；token 为空或缺失返回 null。
 * 前后空白会被裁剪；URL 编码自动解码（URLSearchParams 语义）。
 */
export function parseTunnelHash(hash: string): TunnelHashBootstrap | null {
    if (!hash.startsWith('#')) return null
    const params = new URLSearchParams(hash.slice(1))
    const token = params.get('token')?.trim()
    if (!token) return null
    return { token }
}

/**
 * 应用引导结果到 settings store（apiBaseUrl 取当前 origin，同源直连）。
 * 手机浏览器无内嵌服务端：upsert 一个 remote 网关条目并激活（同源地址已存在
 * 则仅更新 token），顶层 apiBaseUrl/token 由 setActiveGateway 同步写入——
 * api-client.getBaseUrl() 在 apiBaseUrl 为空时直接 throw，必须先写入。
 */
export function applyTunnelBootstrap(
    settings: {
        gateways: { id: string, type: 'local' | 'remote', apiBaseUrl: string }[]
        addGateway: (profile: { type: 'local' | 'remote', name: string, apiBaseUrl: string, token: string }) => { id: string }
        updateGateway: (id: string, patch: { token: string }) => void
        setActiveGateway: (id: string) => void
        save: (patch: Record<string, unknown>) => void
    },
    origin: string,
    bootstrap: TunnelHashBootstrap,
): void {
    const normalized = (url: string) => url.replace(/\/+$/, '')
    const existing = settings.gateways.find(
        (g) => g.type === 'remote' && normalized(g.apiBaseUrl) === normalized(origin),
    )
    if (existing) {
        settings.updateGateway(existing.id, { token: bootstrap.token })
        settings.setActiveGateway(existing.id)
    } else {
        const entry = settings.addGateway({
            type: 'remote',
            name: gatewayHostLabel(origin) || origin,
            apiBaseUrl: origin,
            token: bootstrap.token,
        })
        settings.setActiveGateway(entry.id)
    }
    settings.save({ setupDone: true })
}

/** 抹掉 URL 中的 hash（保留 path + search），令牌不留在地址栏与历史记录。 */
export function stripHashFromUrl(url: string): string {
    const hashIndex = url.indexOf('#')
    return hashIndex >= 0 ? url.slice(0, hashIndex) : url
}
