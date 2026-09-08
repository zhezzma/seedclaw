import { useToast } from './useToast'
import router from '../router'
import { isTauri, onServerMessage, type WsMessage } from './notify-server-connection'
import { onNotificationClicked } from '@choochmeque/tauri-plugin-notifications-api'
import { markNotificationNavigation } from './useNotificationReloadGuard'

/**
 * 通知点击精确跳转：/chat/:sessionKey。
 * - Tauri：系统通知由 Rust 侧发送（携带 sessionKey extra），点击后由社区通知插件
 *   的 notificationClicked 事件回传，覆盖 Android/iOS 冷启动与热后台。
 * - 浏览器 PWA：Web Notification onclick 直接路由。
 */
const navigateToSession = (sessionKey: string) => {
    if (!sessionKey) return
    // 打开重载抑制窗口：移动端点通知回前台时 App.vue 的 reload 流程需让路
    markNotificationNavigation()
    router.push({ name: 'chat', params: { sessionkey: sessionKey } })
}

/**
 * 恢复并聚焦主窗口：点系统通知 = 用户要回程序，窗口可能藏在托盘（CloseRequested → hide）、
 * 被最小化或压在其他窗口后面。Windows 非 MSIX 无 COM activator，点击 Toast 只触发
 * 进程内事件，系统不会自动把窗口拉回前台，必须手动 show + unminimize + setFocus
 * （与 lib.rs 单实例回调的恢复姿势一致）。
 */
const restoreMainWindow = async () => {
    try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        await win.show()
        await win.unminimize()
        await win.setFocus()
    } catch (e) {
        // Android 冷启动点击时窗口 API 可能不支持，无碍——OS 本身已把 app 拉回前台
        console.warn('Failed to restore main window', e)
    }
}

const initNotificationClickNavigation = async () => {
    if (!isTauri) return
    // 新增监听独立 try/catch：失败不能拖垮 onNotificationClicked 的注册
    // （后者是 Android/iOS 冷启动点击的关键链路）
    try {
        // 桌面 Windows：通知中心（历史通知列表）点击不走插件的 notificationClicked 事件
        // （进程内 Activated 只覆盖横幅期），由 Rust 侧 COM activator 发的
        // notify://toast-activated 接住——payload 同为 {id, data:{sessionKey}}
        const { listen } = await import('@tauri-apps/api/event')
        const unlisten = await listen<{ id?: number, data?: { sessionKey?: string } }>(
            'notify://toast-activated',
            (event) => {
                void restoreMainWindow()
                navigateToSession(String(event.payload?.data?.sessionKey || ''))
            }
        )
        // unlisten 挂到进程生命周期（App 常驻，无需清理）
        void unlisten
    } catch (e) {
        console.warn('Failed to subscribe toast-activated', e)
    }

    try {
        // set_click_listener_active 由插件内部触发：冷启动时补发 pending 点击
        await onNotificationClicked((data) => {
            void restoreMainWindow()
            navigateToSession(String(data?.data?.sessionKey || ''))
        })
    } catch (e) {
        console.warn('Failed to subscribe notificationClicked', e)
    }
}

const showInAppNotification = (title: string, body: string, sessionKey: string) => {
    const { info } = useToast()
    info(title ? `${title}: ${body}` : body, {
        duration: 10000,
        onClick: () => {
            navigateToSession(sessionKey)
        }
    })
}

const showNativeNotification = (title: string, body: string, sessionKey: string) => {
    try {
        const n = new Notification(title, {
            body,
            tag: 'chat-msg',
            requireInteraction: true
        })

        n.onclick = (event: Event) => {
            event.preventDefault()
            window.focus()
            n.close()
            navigateToSession(sessionKey)
        }
    } catch (e) {
        console.error('Native notification error:', e)
        showInAppNotification(title, body, sessionKey)
    }
}

export const triggerNotify = (title: string, body: string, sessionKey: string) => {
    try {
        // Tauri 环境：Rust 侧已通过系统通知插件发送（带 sessionKey extra，支持点击精确跳转），
        // 前端不再重复弹通知，仅非 Tauri 浏览器环境使用 Web Notification。
        if (isTauri) return

        if (!('Notification' in window)) {
            showInAppNotification(title, body, sessionKey)
        }
        else if (Notification.permission === 'granted') {
            showNativeNotification(title, body, sessionKey)
        }
        else if (Notification.permission === 'denied') {
            showInAppNotification(title, body, sessionKey)
        }
        else {
            showInAppNotification(title, body, sessionKey)
            Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                    showNativeNotification(title, body, sessionKey)
                } else {
                    showInAppNotification(title, body, sessionKey)
                }
            })
        }
    } catch (error) {
        console.error('Notification logic error:', error)
        showInAppNotification(title, body, sessionKey)
    }
}

function handleServerMessage(msg: WsMessage) {
    if (isTauri) {
        return
    }

    if (msg.event === 'notification') {
        const { title, sessionId, message } = msg.payload
        triggerNotify(title ?? '', message, sessionId)
    }
}

onServerMessage(handleServerMessage)

// 点击监听随 useNotify() 注册（useAppInit 启动时调用）：冷启动 pending 点击
// 的补发依赖此监听，不能只靠模块导入副作用，避免被误当作无用调用清理。
let clickNavigationInitialized = false

export function useNotify() {
    if (!clickNavigationInitialized) {
        clickNavigationInitialized = true
        void initNotificationClickNavigation()
    }
    return {}
}
