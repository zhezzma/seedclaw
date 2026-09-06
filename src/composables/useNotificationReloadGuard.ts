import { shouldSuppressForegroundReload } from '../utils/notification-routing'

/**
 * 通知点击跳转的前台重载抑制窗口。
 * 移动端点系统通知回前台会触发 tauri://focus → App.vue 的重载流程，
 * 若不抑制，reload 会与通知精确跳转互相打架。useNotify 跳转前调用
 * markNotificationNavigation 打开窗口，App.vue 重载前查询是否处于窗口内。
 */
const NOTIFICATION_RELOAD_SUPPRESS_MS = 5_000

let suppressForegroundReloadUntil: number | null = null

export const markNotificationNavigation = () => {
    suppressForegroundReloadUntil = Date.now() + NOTIFICATION_RELOAD_SUPPRESS_MS
}

export const isForegroundReloadSuppressed = (nowMs: number = Date.now()): boolean =>
    shouldSuppressForegroundReload(suppressForegroundReloadUntil, nowMs)
