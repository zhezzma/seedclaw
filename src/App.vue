<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
// import { onAction } from '@tauri-apps/plugin-notification' // Keep if needed, but might be optional
// import { listen } from '@tauri-apps/api/event'
import { useUiSettingsStore } from './stores/setting'
import MessagePlugin from './components/MessagePlugin.vue'
import ConfirmPlugin from './components/ConfirmPlugin.vue'
import ExecApprovalModal from './components/ExecApprovalModal.vue'
import WeixinLoginModal from './components/WeixinLoginModal.vue'
import { useAppInit } from './composables/useAppInit'
import { ApiError } from './composables/api-client'
import { useSessionsState } from './composables/useSessionsState'
import { useToast } from './composables/useToast'
import {
    buildSessionLocation,
    buildTaskSessionsLocation,
    getNotificationFallbackToastKey,
    resolveNotificationNavigation,
    shouldReloadAfterForeground,
    shouldSuppressForegroundReload,
    type PendingNotificationMap,
} from './utils/notification-routing'
import { buildTaskSessionNotificationRoutePlan } from './utils/task-sessions-routing'
import { onAction } from '@tauri-apps/plugin-notification'
import { listen } from '@tauri-apps/api/event'

// Initialize app
const { t } = useI18n()
const toast = useToast()
const uiSettings = useUiSettingsStore()
uiSettings.initTheme()
uiSettings.initLanguage()

const appInit = useAppInit()
appInit.init()




const router = useRouter()
const sessionsState = useSessionsState()
const notificationMap = ref<PendingNotificationMap>({})
let unlistenNotification: (() => void) | null = null
let unlistenFocus: (() => void) | null = null

const MOBILE_BACKGROUND_RELOAD_MS = 60_000
const NOTIFICATION_RELOAD_SUPPRESS_MS = 5_000
const NOTIFICATION_TTL_MS = 5 * 60 * 1000
const FOREGROUND_RELOAD_GRACE_MS = 1_200
const isTauriApp = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
const isMobileTauri = isTauriApp && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
let backgroundedAt: number | null = null
let suppressForegroundReloadUntil: number | null = null
let pendingForegroundReloadTimer: number | null = null

const cancelPendingForegroundReload = () => {
    if (pendingForegroundReloadTimer != null) {
        window.clearTimeout(pendingForegroundReloadTimer)
        pendingForegroundReloadTimer = null
    }
}

const markNotificationNavigation = () => {
    suppressForegroundReloadUntil = Date.now() + NOTIFICATION_RELOAD_SUPPRESS_MS
    cancelPendingForegroundReload()
}

const openSessionFromNotification = async (sessionKey: string) => {
    if (!sessionKey) return

    markNotificationNavigation()
    const sessionRouteState = await sessionsState.resolveNotificationSessionRouteState(sessionKey)

    if (sessionRouteState?.sessionCategory === 'task') {
        // 任务通知不能总是直接 push 到 /tasks/:id。
        // 若当前不在任务列表，必须先补一层 /tasks 到历史栈里，
        // 这样移动端从通知进入详情后：第一次返回回列表，第二次返回才回到通知前页面。
        const plan = buildTaskSessionNotificationRoutePlan(
            sessionKey,
            router.currentRoute.value.name,
            typeof router.currentRoute.value.params.sessionkey === 'string'
                ? router.currentRoute.value.params.sessionkey
                : undefined,
        )

        for (const location of plan) {
            await router.push(location)
        }
        return
    }

    await router.push(buildSessionLocation(sessionKey, sessionRouteState))
}

const openTaskSessionsFromNotification = async (toastKey?: 'notificationsNoCandidates' | 'notificationsMultipleCandidates') => {
    markNotificationNavigation()
    await router.push(buildTaskSessionsLocation())
    if (toastKey) {
        toast.info(t(`home.${toastKey}`), 3000)
    }
}

const markBackgrounded = () => {
    // 仅在移动端 Tauri 启用：桌面端切窗口很常见，不应触发重载策略。
    if (!isMobileTauri) return
    if (document.visibilityState === 'hidden') {
        backgroundedAt = Date.now()
    }
}

const resolveForegroundResumeAction = async (): Promise<'reload' | 'go-home'> => {
    const routeName = router.currentRoute.value.name
    const sessionKey = typeof router.currentRoute.value.params.sessionkey === 'string'
        ? router.currentRoute.value.params.sessionkey
        : undefined

    if ((routeName !== 'chat' && routeName !== 'tasks') || !sessionKey) {
        return 'reload'
    }

    try {
        const session = await sessionsState.getSessionById(sessionKey, routeName === 'tasks' ? 'task' : undefined, {
            forceRefresh: true,
            throwOnError: true,
        })
        return session ? 'reload' : 'go-home'
    } catch (error: unknown) {
        if (error instanceof ApiError && error.code === 404) {
            return 'go-home'
        }
        // 非 404（如网络抖动）不应误伤为首页，保持原来的 reload 行为。
        console.warn('[app] failed to validate foreground session before reload', error)
        return 'reload'
    }
}

const handleForeground = () => {
    if (!isMobileTauri || backgroundedAt == null) return

    const elapsed = Date.now() - backgroundedAt
    backgroundedAt = null
    const now = Date.now()
    const reloadSuppressed = shouldSuppressForegroundReload(suppressForegroundReloadUntil, now)

    // Android/iOS 回前台后，WebView 内存往往还在，但长连接 / 本地缓存状态可能已漂移。
    // 但如果本次 focus 是由“点击通知”触发，需要跳过 reload，避免与通知跳转互相打架。
    if (!shouldReloadAfterForeground(elapsed, MOBILE_BACKGROUND_RELOAD_MS, reloadSuppressed)) {
        return
    }

    cancelPendingForegroundReload()
    pendingForegroundReloadTimer = window.setTimeout(async () => {
        pendingForegroundReloadTimer = null

        if (shouldSuppressForegroundReload(suppressForegroundReloadUntil, Date.now())) {
            return
        }

        const resumeAction = await resolveForegroundResumeAction()
        if (resumeAction === 'go-home') {
            console.log(`[app] Mobile app resumed after ${elapsed}ms in background, session missing, redirecting home...`)
            window.location.replace('/')
            return
        }

        console.log(`[app] Mobile app resumed after ${elapsed}ms in background, reloading page...`)
        window.location.reload()
    }, FOREGROUND_RELOAD_GRACE_MS)
}

onMounted(async () => {
    document.addEventListener('visibilitychange', markBackgrounded)

    try {
        // Check if running in Tauri environment
        if (!isTauriApp) return;

        // 监听 Rust 发送的 "notify://notification-sent" 事件
        // 作用：接收通知 ID 和 SessionKey 的对应关系
        // 原理：Rust 发出通知的同时会广播这个事件，告诉前端 "通知 ID 123 对应的是会话 ABC"
        unlistenNotification = await listen('notify://notification-sent', (event: any) => {
            const payload = event.payload
            console.log('Notification sent:', payload)
            if (payload && payload.id && payload.sessionKey) {
                // 将关系存入 map，供后续点击时查询；createdAt 用于 TTL 过期清理，避免旧通知污染 tap 判定。
                notificationMap.value[String(payload.id)] = {
                    sessionKey: payload.sessionKey,
                    createdAt: Date.now(),
                }
            }
        })

        // Listen for app focus event (e.g. switching back from background)
        unlistenFocus = await listen('tauri://focus', () => {
            handleForeground()
            console.log('App focused, checking connection...')
            import('./composables/notify-server-connection').then(({ checkConnection }) => {
                checkConnection()
            })
        })

        // 监听用户点击通知的动作
        // 作用：当用户点击系统通知时触发
        // 原理：操作系统只告诉我们 "用户点了 ID 为 123 的通知"，我们需要去 map 里查出它对应的会话 Key
        // 监听用户点击通知的动作
        // 注意：Tauri v2 的 Notification Action API 目前主要支持移动端 (Android/iOS)
        // 在 Windows/Desktop 上，如果此功能未实现或权限不可用，可能会抛出 "Command not found" 或 "registerListener not allowed"
        // 这里的 try-catch 是为了防止桌面端报错中断应用流程
        try {
            await onAction(async (event) => {
                console.log('Notification action:', event)
                const actionId = (event as any)?.actionId || ''

                // Fallback: actionId 直接携带 sessionId 时，优先走精确目标跳转。
                if (actionId && actionId.startsWith('open_session:')) {
                    const key = actionId.split('open_session:')[1]
                    await openSessionFromNotification(key)
                    return
                }

                // Event might be the ID directly or an object with ID.
                let notificationId: string | undefined
                if (typeof event === 'string' || typeof event === 'number') {
                    notificationId = String(event)
                } else if ((event as any)?.id) {
                    notificationId = String((event as any).id)
                }

                const resolution = resolveNotificationNavigation({
                    notificationMap: notificationMap.value,
                    notificationId,
                    nowMs: Date.now(),
                    ttlMs: NOTIFICATION_TTL_MS,
                })
                notificationMap.value = resolution.remainingNotifications

                console.info('[notification] navigation resolved:', {
                    kind: resolution.kind,
                    reason: resolution.reason,
                    sessionKey: resolution.kind === 'session' ? resolution.sessionKey : undefined,
                    remainingCount: Object.keys(resolution.remainingNotifications).length,
                })

                if (resolution.kind === 'session') {
                    await openSessionFromNotification(resolution.sessionKey)
                    return
                }

                await openTaskSessionsFromNotification(getNotificationFallbackToastKey(resolution))
            })
        } catch (actionError) {
            console.warn('Configuration Note: Notification actions (onAction) are not supported on this platform or permissions are missing. Interaction might be limited to system default behavior.', actionError);
        }
    } catch (e) {
        console.error('Failed to setup notification listener', e)
    }
})

onUnmounted(() => {
    document.removeEventListener('visibilitychange', markBackgrounded)
    cancelPendingForegroundReload()
    if (unlistenNotification) {
        unlistenNotification()
    }
    if (unlistenFocus) {
        unlistenFocus()
    }
}) 
</script>

<template>
    <div class="fixed inset-0 bg-base-100 overflow-hidden text-base-content font-sans">
        <RouterView />
        <MessagePlugin />
        <ExecApprovalModal />
        <WeixinLoginModal />
        <ConfirmPlugin />
    </div>
</template>

<style>
/* Global styles */
</style>late>

<style>
/* Global styles */
</style>