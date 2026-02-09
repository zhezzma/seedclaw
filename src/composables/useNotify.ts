import { useGateway } from './useGateway'
import { useToast } from './useToast'
import router from '../router'
import { useCronState } from './useCronState'
import { useUiSettingsStore } from '../stores/setting'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isCronSession } from '../utils/session-key-helpers'
import { useSessionsState } from './useSessionsState'

let initialized = false
const NOTIFY_LENGTH_THRESHOLD = 50

export function useNotify() {
    if (initialized) return
    initialized = true

    const gatewayStore = useGateway()
    const { info } = useToast()
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

                    //重新加载sessions,更新消息列表
                    void loadSessions()

                    //如果是tauri,他们有自己弹出通知的机制
                    const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
                    if (isTauri) return

                    info(`${title}: ${body}`, {
                        duration: 10000,
                        onClick: () => {
                            router.push({
                                name: 'chat',
                                params: { sessionkey: sessionKey }
                            })
                        }
                    })
                }
            }

            // Check for cron-triggered session start
            if (stream === 'lifecycle' && isCronSession(sessionKey)) {
                if (data?.phase === 'start') {
                    pendingCronSessions.set(sessionKey, '') // Changed from add to set with empty string
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
                const currentText = data?.text || ''
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
