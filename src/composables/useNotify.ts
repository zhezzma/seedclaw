import { useToast } from './useToast'
import router from '../router'
import { useUiSettingsStore } from '../stores/setting'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

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
                    query: sessionKey.includes(':cron:') ? { type: 'cron' } : undefined
                });
            }
        };
    } catch (e) {
        console.error('Native notification error:', e);
        showInAppNotification(title, body, sessionKey);
    }
};

export function useNotify() {
    if (initialized) return
    initialized = true

    // Note: Without WebSocket gateway, real-time notifications for background events 
    // (like cron job completions) are not available. This module now only provides
    // the notification display infrastructure. SSE chat events handle in-chat notifications.
    // Future: could add a polling mechanism or SSE connection for background events.
}
