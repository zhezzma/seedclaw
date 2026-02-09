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

export function useNotify() {
    if (initialized) return
    initialized = true

    const gatewayStore = useGateway()
    const { info } = useToast()
    const { loadSessions } = useSessionsState()
    // We need cron state to look up job names
    const cronState = useCronState()
    const pendingCronSessions = new Set<string>()


    gatewayStore.subscribe((evt: any) => {
        const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;
        if (isTauri) return

        if (evt.event === 'agent' && evt.payload) {
            const { stream, data, sessionKey } = evt.payload

            // Check for cron-triggered session start
            if (stream === 'lifecycle' && data?.phase === 'start' && isCronSession(sessionKey)) {
                pendingCronSessions.add(sessionKey)
                return
            }

            // Determine if this is a follow-up event for a pending cron session
            if (sessionKey && pendingCronSessions.has(sessionKey)) {
                const currentText = data?.text || ''
                if (currentText.length > NOTIFY_LENGTH_THRESHOLD) {
                    pendingCronSessions.delete(sessionKey)

                    const jobId = sessionKey.split(':cron:')[1]
                    // @ts-ignore - cronJobs access via proxy
                    const job = cronState.cronJobs.find((j: any) => j.id === jobId)
                    const title = job ? `${job.name}` : '你收到了一条定时消息';

                    // Trigger local notification
                    (async () => {
                        // Check for Tauri environment (v1 or v2)
                        const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;

                        if (isTauri) {
                            try {
                                let permissionGranted = await isPermissionGranted();
                                if (!permissionGranted) {
                                    const permission = await requestPermission();
                                    permissionGranted = permission === 'granted';
                                }
                                if (permissionGranted) {
                                    sendNotification({
                                        title,
                                        body: currentText,
                                    });
                                }
                            } catch (e) {
                                console.warn('Native notification failed:', e);
                            }
                        } else {
                            // Fallback to toast
                            info(currentText, {
                                duration: 10000,
                                onClick: () => {
                                    router.push({
                                        name: 'chat',
                                        params: { sessionkey: sessionKey }
                                    })
                                }
                            })
                        }
                    })();
                    void loadSessions()
                }
            }
        }
    })
}
