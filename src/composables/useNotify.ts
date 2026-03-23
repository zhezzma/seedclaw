import { useToast } from './useToast'
import router from '../router'
import { isTauri, onServerMessage, type WsMessage } from './notify-server-connection'
import { useSessionsState } from './useSessionsState'
import { buildSessionLocation } from '../utils/notification-routing'
import { buildTaskSessionNotificationRoutePlan } from '../utils/task-sessions-routing'

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

    const sessionCategory = await useSessionsState().resolveNotificationSessionCategory(sessionKey)
    if (sessionCategory === 'task') {
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

    await router.push(buildSessionLocation(sessionKey, sessionCategory))
}

const showInAppNotification = (title: string, body: string, sessionKey: string) => {
    const { info } = useToast()
    console.log('Falling back to in-app notification')
    info(title ? `${title}: ${body}` : body, {
        duration: 10000,
        onClick: () => {
            void openSessionFromNotification(sessionKey)
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

        n.onclick = (event) => {
            event.preventDefault()
            window.focus()
            n.close()
            if (router) {
                void openSessionFromNotification(sessionKey)
            }
        }
    } catch (e) {
        console.error('Native notification error:', e)
        showInAppNotification(title, body, sessionKey)
    }
}

export const triggerNotify = (title: string, body: string, sessionKey: string) => {
    try {
        console.log('trigger notification check', title, body)

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

const _notifyState = {}

export function useNotify() {
    return _notifyState
}
