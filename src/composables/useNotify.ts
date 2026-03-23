import { useToast } from './useToast'
import router from '../router'
import { isTauri, onServerMessage, type WsMessage } from './notify-server-connection'
import { useSessionsState } from './useSessionsState'
import { buildNotificationChatLocation } from '../utils/notification-routing'

export interface WsTaskData {
    taskId: string
    taskName: string
    agentId: string
    sessionId?: string
    sessionName?: string
    prompt?: string
    resultSnippet?: string
    error?: string
    // Command execution approval
    command?: string
    expiresAtMs?: number
    id?: string
}

const openSessionFromNotification = async (sessionKey: string) => {
    if (!sessionKey) return

    const sessionType = await useSessionsState().resolveNotificationSessionType(sessionKey)
    await router.push(buildNotificationChatLocation(sessionKey, sessionType))
}

// 1. 定义兜底逻辑（App内通知），避免代码重复
const showInAppNotification = (title: string, body: string, sessionKey: string) => {
    const { info } = useToast()
    console.log('Falling back to in-app notification');
    info(title ? `${title}: ${body}` : body, {
        duration: 10000,
        onClick: () => {
            void openSessionFromNotification(sessionKey)
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
                void openSessionFromNotification(sessionKey)
            }
        };
    } catch (e) {
        console.error('Native notification error:', e);
        showInAppNotification(title, body, sessionKey);
    }
};

export const triggerNotify = (title: string, body: string, sessionKey: string) => {
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

function handleServerMessage(msg: WsMessage) {

    if (isTauri) {
        return;
    }

    if (msg.event === 'notification') {
        const { title, sessionId, message } = msg.payload
        triggerNotify(title ?? "", message, sessionId)
    }

}


// 模块级注册，只执行一次（防止多次调用 useNotify() 重复注册 handler 导致通知重复触发）
onServerMessage(handleServerMessage)

const _notifyState = {}

export function useNotify() {
    return _notifyState
}



