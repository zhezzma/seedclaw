<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { onAction } from '@tauri-apps/plugin-notification'
import { listen } from '@tauri-apps/api/event'
import { useUiSettingsStore } from './stores/setting'
import MessagePlugin from './components/MessagePlugin.vue'
import ConfirmPlugin from './components/ConfirmPlugin.vue'
import ExecApprovalModal from './components/ExecApprovalModal.vue'
import { useAppInit } from './composables/useAppInit'
import { useToast } from './composables/useToast'
// Initialize theme at app root
useUiSettingsStore().initTheme()
// Initialize app and connect
useAppInit().init()

const router = useRouter()
const notificationMap = ref<Record<string, string>>({})
let unlistenNotification: (() => void) | null = null



onMounted(async () => {
    try {
        // Check if running in Tauri environment
        const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
        if (!isTauri) return;

        // 监听 Rust 发送的 "gateway://notification-sent" 事件
        // 作用：接收通知 ID 和 SessionKey 的对应关系
        // 原理：Rust 发出通知的同时会广播这个事件，告诉前端 "通知 ID 123 对应的是会话 ABC"
        unlistenNotification = await listen('gateway://notification-sent', (event: any) => {
            const payload = event.payload
            console.log('Notification sent:', payload)
            if (payload && payload.id && payload.sessionKey) {
                // 将关系存入 map，供后续点击时查询
                notificationMap.value[String(payload.id)] = payload.sessionKey
                // Optional: cleanup old entries to prevent memory leak
            }
        })

        // 监听用户点击通知的动作
        // 作用：当用户点击系统通知时触发
        // 原理：操作系统只告诉我们 "用户点了 ID 为 123 的通知"，我们需要去 map 里查出它对应的会话 Key
        // 监听用户点击通知的动作
        // 注意：Tauri v2 的 Notification Action API 目前主要支持移动端 (Android/iOS)
        // 在 Windows/Desktop 上，如果此功能未实现或权限不可用，可能会抛出 "Command not found" 或 "registerListener not allowed"
        // 这里的 try-catch 是为了防止桌面端报错中断应用流程
        try {
            await onAction((event) => {
                console.log('Notification action:', event)
                // Event might be the ID directly or an object with ID
                // Check if we have a mapped session key for this notification ID
                let notificationId = ''
                if (typeof event === 'string' || typeof event === 'number') {
                    notificationId = String(event)
                } else if ((event as any).id) {
                    notificationId = String((event as any).id)
                }
                // Android specific: clicking the notification body often returns 'tap' as the action
                else if ((event as any).actionId === 'tap') {
                    // If we only have one active notification or track the last one, we could use it.
                    // For now, let's try to find *any* pending notification or the most recent one.
                    // A simple heuristic: if there's only one key in the map, use it.
                    const keys = Object.keys(notificationMap.value);
                    if (keys.length > 0) {
                        // Use the most recently added one (assuming keys roughly ordered or just pick one)
                        // Better approach: track `lastNotificationId` separately.
                        notificationId = keys[keys.length - 1];
                        console.log("Tap event received, defaulting to last notificationId:", notificationId);
                    }
                }

                const sessionKey = notificationMap.value[notificationId]
                if (sessionKey) {
                    router.push({
                        name: 'chat',
                        params: { sessionkey: sessionKey },
                        // 如果包含则传递对象，否则传递 undefined (Vue Router 会自动忽略 undefined 的 query)
                        query: sessionKey.includes(':cron:') ? { type: 'cron' } : undefined
                    });
                    // Clean up map
                    delete notificationMap.value[notificationId]
                } else {
                    // Fallback: check actionId if we ever use it again
                    // 注意：sessionKey 在这里可能未定义，但在 fallback 中我们假设它已被其他逻辑处理，或者这里有一个 bug
                    // 为了安全起见，我们只在确信 key 存在时跳转
                    const actionId = (event as any).actionId || ''
                    if (actionId && actionId.startsWith('open_session:')) {
                        const key = actionId.split('open_session:')[1]
                        router.push({
                            name: 'chat',
                            params: { sessionkey: key },
                            query: key.includes(':cron:') ? { type: 'cron' } : undefined
                        });
                    }
                }
            })
        } catch (actionError) {
            console.warn('Configuration Note: Notification actions (onAction) are not supported on this platform or permissions are missing. Interaction might be limited to system default behavior.', actionError);
        }
    } catch (e) {
        console.error('Failed to setup notification listener', e)
    }
})

onUnmounted(() => {
    if (unlistenNotification) {
        unlistenNotification()
    }
})
</script>

<template>
    <div class="fixed inset-0 pt-[env(safe-area-inset-top)] bg-base-100 overflow-hidden">
        <router-view />
        <MessagePlugin />
        <ExecApprovalModal />
        <ConfirmPlugin />
    </div>
</template>

<style></style>