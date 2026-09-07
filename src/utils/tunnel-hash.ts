/**
 * 移动端隧道 hash 引导。
 *
 * PC 端 tunnel 面板二维码内容：http://<vps-ip>:<port>/#token=<访问令牌>
 * 手机扫码打开后，前端启动时（main.ts，早于任何 API 调用）解析 hash：
 *   - 有 token → 写入 settings（apiBaseUrl = window.location.origin，同源服务端；
 *     注意 api-client.getBaseUrl() 在 apiBaseUrl 为空时直接 throw，必须先写入）
 *   - 抹掉 hash（history.replaceState），避免令牌留在地址栏/历史记录
 *   - setupDone = true 跳过首次引导向导，直接进 UI
 */

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

/** 应用引导结果到 settings store（apiBaseUrl 取当前 origin，同源直连）。 */
export function applyTunnelBootstrap(
    settings: {
        save: (patch: Record<string, unknown>) => void
    },
    origin: string,
    bootstrap: TunnelHashBootstrap,
): void {
    settings.save({
        apiBaseUrl: origin,
        token: bootstrap.token,
        // 手机浏览器无内嵌服务端：固化 remote 模式（含 remote* 字段，供网关切换回读）
        gatewayMode: 'remote',
        remoteApiBaseUrl: origin,
        remoteToken: bootstrap.token,
        setupDone: true,
    })
}

/** 抹掉 URL 中的 hash（保留 path + search），令牌不留在地址栏与历史记录。 */
export function stripHashFromUrl(url: string): string {
    const hashIndex = url.indexOf('#')
    return hashIndex >= 0 ? url.slice(0, hashIndex) : url
}
