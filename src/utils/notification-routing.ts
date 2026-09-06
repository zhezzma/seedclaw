/**
 * 通知精确跳转重构后，本模块只保留「移动端 Tauri 前后台切换重载」相关的纯函数。
 * 原任务/归档路由分流、通知候选解析、兜底导航均已删除：
 * 点击通知由社区通知插件的 notificationClicked 事件携带 sessionKey 精确跳转 /chat/:id。
 */

export const shouldSuppressForegroundReload = (
    suppressUntilMs: number | null | undefined,
    nowMs: number,
): boolean => {
    return typeof suppressUntilMs === 'number' && suppressUntilMs > nowMs
}

export const shouldReloadAfterForeground = (
    elapsedMs: number,
    reloadThresholdMs: number,
    isSuppressed: boolean,
): boolean => {
    return elapsedMs >= reloadThresholdMs && !isSuppressed
}
