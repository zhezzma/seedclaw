import { useGateway } from './useGateway'
import { useToast } from './useToast'
import router from '../router'
import { useCronState } from './useCronState'
import { useUiSettingsStore } from '../stores/setting'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isCronSession } from '../utils/session-key-helpers'
import { useSessionsState } from './useSessionsState'

let initialized = false
const NOTIFY_LENGTH_THRESHOLD = 20


// 1. 定义兜底逻辑（App内通知），避免代码重复
const showInAppNotification = (title: string, body: string, sessionKey: string) => {
    const { info } = useToast()
    console.log('Falling back to in-app notification');
    info(`${title}: ${body}`, {
        duration: 10000,
        onClick: () => {
            router.push({
                name: 'chat',
                params: { sessionkey: sessionKey },
                // 如果包含则传递对象，否则传递 undefined (Vue Router 会自动忽略 undefined 的 query)
                query: sessionKey.includes(':cron:') ? { type: 'cron' } : undefined
            });
        }
    });
};

// 2. 定义原生通知逻辑
const showNativeNotification = (title: string, body: string, sessionKey: string) => {
    try {
        const n = new Notification(title, {
            body: body,
            tag: 'chat-msg',
            requireInteraction: true
        });

        n.onclick = (event) => {
            event.preventDefault();
            window.focus();
            n.close();
            if (router) {
                router.push({
                    name: 'chat',
                    params: { sessionkey: sessionKey },
                    // 如果包含则传递对象，否则传递 undefined (Vue Router 会自动忽略 undefined 的 query)
                    query: sessionKey.includes(':cron:') ? { type: 'cron' } : undefined
                });
            }
        };
    } catch (e) {
        // 极少数情况下，new Notification 可能会报错（如安卓Webview兼容性问题）
        console.error('Native notification error:', e);
        showInAppNotification(title, body, sessionKey);
    }
};

export function useNotify() {
    if (initialized) return
    initialized = true

    const gatewayStore = useGateway()

    const { loadSessions } = useSessionsState()
    // We need cron state to look up job names
    const cronState = useCronState()
    const pendingCronSessions = new Map<string, string>()


    gatewayStore.subscribe((evt: any) => {
        if (evt.event === 'agent' && evt.payload) {
            const { stream, data, sessionKey } = evt.payload

            const trigger = (title: string) => {
                if (pendingCronSessions.has(sessionKey)) {
                    let body = pendingCronSessions.get(sessionKey) || ''
                    if (!body) body = '任务已完成'

                    pendingCronSessions.delete(sessionKey)

                    //如果是tauri,他们有自己弹出通知的机制
                    const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
                    if (isTauri) return

                    // 3. 主逻辑判断
                    try {
                        console.log('trigger notification check', title, body);

                        // A. 检查浏览器是否支持
                        if (!("Notification" in window)) {
                            showInAppNotification(title, body, sessionKey); // 不支持 -> 兜底
                        }
                        // B. 权限已允许
                        else if (Notification.permission === 'granted') {
                            showNativeNotification(title, body, sessionKey); // 允许 -> 原生
                        }
                        // C. 权限被明确拒绝 (Denied)
                        else if (Notification.permission === 'denied') {
                            showInAppNotification(title, body, sessionKey); // 拒绝 -> 兜底
                        }
                        // D. 权限是默认状态 (Default/Pending)，需要询问
                        else {
                            showInAppNotification(title, body, sessionKey); // Default -> 兜底

                            //现代浏览器中的通知权限必须手动触发。为了防止垃圾信息骚扰，浏览器（如 Chrome、Firefox、Safari）通常要求只有在用户通过点击按钮或类似操作产生交互后，网站才能弹出权限申请请求。直接在页面加载时自动申请通知权限的方法大部分已被禁止。 
                            //所以下面的请求权限的代码是无效的
                            Notification.requestPermission().then((permission) => {
                                if (permission === 'granted') {
                                    showNativeNotification(title, body, sessionKey); // 用户点了允许 -> 原生
                                } else {
                                    showInAppNotification(title, body, sessionKey); // 用户点了拒绝或关闭了弹窗 -> 兜底
                                }
                            });
                        }
                    } catch (error) {
                        // 捕获其他未知的语法或运行时错误
                        console.error('Notification logic error:', error);
                        showInAppNotification(title, body, sessionKey);
                    }
                }
            }

            // Check for cron-triggered session start
            if (stream === 'lifecycle' && isCronSession(sessionKey)) {
                if (data?.phase === 'start') {
                    pendingCronSessions.set(sessionKey, '') // Changed from add to set with empty string
                    //重新加载sessions,更新消息列表
                    void loadSessions()
                    return
                } else if (data?.phase === 'end') {
                    const jobId = sessionKey.split(':cron:')[1]
                    // @ts-ignore - cronJobs access via proxy
                    const job = cronState.cronJobs.find((j: any) => j.id === jobId)
                    const title = job ? `${job.name}` : '你收到了一条定时消息'
                    trigger(title)
                    return
                }
            }

            // Determine if this is a follow-up event for a pending cron session
            if (sessionKey && pendingCronSessions.has(sessionKey)) {
                const currentText = data?.delta || ''
                const buffer = (pendingCronSessions.get(sessionKey) || '') + currentText // Buffering logic
                pendingCronSessions.set(sessionKey, buffer) // Update map with buffer

                if (buffer.length > NOTIFY_LENGTH_THRESHOLD) { // Changed condition to use buffer length
                    const jobId = sessionKey.split(':cron:')[1]
                    // @ts-ignore - cronJobs access via proxy
                    const job = cronState.cronJobs.find((j: any) => j.id === jobId)
                    const title = job ? `${job.name}` : '你收到了一条定时消息';
                    trigger(title) // Trigger notification
                }
            }
        }
    })
}
