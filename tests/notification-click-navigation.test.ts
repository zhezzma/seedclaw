import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const useNotifySource = readFileSync(path.join(root, 'src/composables/useNotify.ts'), 'utf8')
const appSource = readFileSync(path.join(root, 'src/App.vue'), 'utf8')
const notifyRustSource = readFileSync(path.join(root, 'src-tauri/src/notify.rs'), 'utf8')
const routerSource = readFileSync(path.join(root, 'src/router/index.ts'), 'utf8')

test('notification clicks navigate precisely to the session chat route', () => {
    // 统一精确跳转：notificationClicked 事件携带 sessionKey extra，直接路由 /chat/:id
    assert.match(useNotifySource, /onNotificationClicked\(\(data\) => \{/)
    assert.match(useNotifySource, /navigateToSession\(String\(data\?\.data\?\.sessionKey \|\| ''\)\)/)
    assert.match(useNotifySource, /router\.push\(\{ name: 'chat', params: \{ sessionkey: sessionKey \} \}\)/)
    // 旧的单候选猜测 / 兜底跳转已删除
    assert.doesNotMatch(useNotifySource, /resolveNotificationNavigation/)
    assert.doesNotMatch(useNotifySource, /openTaskSessions/)
})

test('frontend skips web notifications inside Tauri (Rust already sends system notification)', () => {
    // Tauri 环境 Rust 侧已发送系统通知（带 sessionKey extra），前端避免重复弹
    assert.match(useNotifySource, /if \(isTauri\) return/)
    assert.match(useNotifySource, /new Notification\(title, \{/)
})

test('App.vue drops notification tap resolution and keeps mobile foreground reload guard', () => {
    assert.doesNotMatch(appSource, /onAction/)
    assert.doesNotMatch(appSource, /notificationMap/)
    assert.doesNotMatch(appSource, /buildTaskSessionNotificationRoutePlan/)
    assert.doesNotMatch(appSource, /openSessionFromNotification/)
    // 移动端前后台重载与抑制窗口保留
    assert.match(appSource, /isForegroundReloadSuppressed/)
    assert.match(appSource, /MOBILE_BACKGROUND_RELOAD_MS/)
})

test('notification click marks reload suppression window via shared guard', () => {
    const guardSource = readFileSync(path.join(root, 'src/composables/useNotificationReloadGuard.ts'), 'utf8')
    assert.match(guardSource, /export const markNotificationNavigation/)
    assert.match(useNotifySource, /import \{ markNotificationNavigation \} from '\.\/useNotificationReloadGuard'/)
    assert.match(useNotifySource, /markNotificationNavigation\(\)/)
})

test('Rust notification carries sessionKey extra for platform click backends', () => {
    assert.match(notifyRustSource, /\.extra\("sessionKey", session_key\)/)
    // id → sessionKey 映射事件已删除：extra 直接随点击回传
    assert.doesNotMatch(notifyRustSource, /notification-sent/)
})

test('router drops tasks/archived routes and session-category redirect guard', () => {
    assert.doesNotMatch(routerSource, /name: 'tasks'/)
    assert.doesNotMatch(routerSource, /name: 'archived'/)
    assert.doesNotMatch(routerSource, /resolveSessionRouteRedirect/)
    assert.doesNotMatch(routerSource, /archived\/:sessionkey/)
})
