import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import type { SessionsState } from '../openclaw/ui/src/ui/controllers/sessions'
import { loadSessions as _loadSessions, patchSession as _patchSession } from '~openclaw/ui/src/ui/controllers/sessions'
import { useUiSettingsStore } from '../stores/setting'

const state = reactive<SessionsState>({
    client: null,
    connected: false,
    sessionsLoading: false,
    sessionsError: null,
    sessionsResult: null,
    sessionsFilterActive: '0',
    sessionsFilterLimit: '0',
    sessionsIncludeGlobal: false,
    sessionsIncludeUnknown: false
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], ([client, connected]) => {
        state.client = client as any
        state.connected = connected as boolean
        if (connected) {
            const settings = useUiSettingsStore()
            const activeMinutes = settings.sessionsActiveDays * 24 * 60
            void _loadSessions(state as any, { activeMinutes })
        }
    }, { immediate: true })
}

export function useSessionsState() {
    ensureInit()

    const loadSessions = async (opts?: any) => {
        // Use settings store for defaults if not provided?
        // useGateway used settings.sessionsActiveDays
        const settings = useUiSettingsStore()
        const activeMinutes = settings.sessionsActiveDays * 24 * 60
        await _loadSessions(state as any, { activeMinutes, ...opts })
    }

    const patchSession = async (key: string, patch: { label?: string | null }) => {
        await _patchSession(state as any, key, patch)
        await loadSessions()
    }

    //CHANGE_OPENCLAW:需要返回删除结果,且openclaw中的里面有弹窗,从session控制器中分离出来
    const deleteSession = async (key: string) => {
        if (!state.client || !state.connected) {
            return { deleted: false };
        }
        if (state.sessionsLoading) {
            return { deleted: false };
        }
        state.sessionsLoading = true;
        state.sessionsError = null;
        try {
            const res: any = await state.client.request("sessions.delete", { key, deleteTranscript: true });
            const deleted = res?.deleted === true;
            if (deleted && state.sessionsResult?.sessions) {
                state.sessionsResult = {
                    ...state.sessionsResult,
                    sessions: state.sessionsResult.sessions.filter((s: any) => s.key !== key)
                };
            }
            return { deleted };
        } catch (err) {
            state.sessionsError = String(err);
            return { deleted: false };
        } finally {
            state.sessionsLoading = false;
        }
    }

    return reactive({
        ...toRefs(state),
        loadSessions,
        patchSession,
        deleteSession
    })

}
