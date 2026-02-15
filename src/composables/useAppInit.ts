import { useNotify } from './useNotify'
import { useUiSettingsStore } from '../stores/setting'
import { useAgentsState } from './useAgentsState'
import { useChatState } from './useChatState'
import { useSessionsState } from './useSessionsState'
import { useGotify } from './useGotify'
import { useCronState } from './useCronState'
import { useExecApproval } from './useExecApproval'
import { useDevicesState } from './useDevicesState'
import { useNodesState } from './useNodesState'
import { usePresence } from './usePresence'
import { useModelsState } from './useModelsState'

/**
 * Initializes all domain-specific state composables.
 * By calling these composables, we execute their `ensureInit()` logic
 * which will auto-load data from the HTTP API.
 */
export function useAppInit() {
    const agentsState = useAgentsState()
    const sessionsState = useSessionsState()
    const { loadModels } = useModelsState()

    const chatState = useChatState()


    const cronState = useCronState()
    const execApprovalState = useExecApproval()
    const devicesState = useDevicesState()
    const nodesState = useNodesState()
    const presenceState = usePresence()
    useNotify()
    // Initialize Gotify
    useGotify().init()

    const settingsStore = useUiSettingsStore()

    const init = async () => {

        await Promise.all([
            agentsState.initAgents(),
            sessionsState.loadSessions(),
            loadModels()
        ])

    }

    return {
        init
    }
}
