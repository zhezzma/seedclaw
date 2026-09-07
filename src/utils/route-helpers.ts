import { type RouteLocationNormalized, type RouteLocationNormalizedLoaded } from 'vue-router'

export const NEW_SESSION_PATH = '/new'
export const NEW_SESSION_ROUTE_NAME = 'new-session'

export function isNewSession(route: RouteLocationNormalized | RouteLocationNormalizedLoaded | null | undefined): boolean {
    if (!route) return false
    return route.path === NEW_SESSION_PATH
}

/**
 * 网关模式切换（本地 ↔ 远程）时的路由落点。
 * 两侧服务端的会话列表互不相通，若当前停在 /chat/<sessionKey>，保留旧 key
 * 会在切换 reload 后指向对端不存在的会话（currentSession 为 null、历史 404）。
 * 因此只要路由带着 sessionKey，就改写到 /new（开新会话页）。
 * 不区分大小写：vue-router 默认大小写不敏感，/Chat/<key> 同样会渲染 chat 视图。
 * 返回 null 表示无需改写。
 */
export function gatewaySwitchTargetUrl(pathname: string): string | null {
    return /^\/chat\/.+$/i.test(pathname) ? NEW_SESSION_PATH : null
}
