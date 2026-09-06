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

const initNotificationClickNavigation = async () => {
    if (!isTauri) return
    try {
        // set_click_listener_active 由插件内部触发：冷启动时补发 pending 点击
        await onNotificationClicked((data) => {
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
