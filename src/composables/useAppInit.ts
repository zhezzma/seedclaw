import { useNotify } from './useNotify'
import { useUiSettingsStore } from '../stores/setting'
import { useAgentsState } from './useAgentsState'
import { useChatState } from './useChatState'
import { useSessionsState } from './useSessionsState'
import { useGotify } from './useGotify'
import { useCronState } from './useCronState'
import { useModelsState } from './useModelsState'
import { useSkillsState } from './useSkillsState'

/**
 * Initializes all domain-specific state composables.
 * By calling these composables, we execute their `ensureInit()` logic
 * which will auto-load data from the HTTP API.
 */
export function useAppInit() {
    const agentsState = useAgentsState()
    const sessionsState = useSessionsState()
    const { loadModels } = useModelsState()
    const { initConvexConnection } = useSkillsState()


    const chatState = useChatState()
    const cronState = useCronState()
    useNotify()
    // Initialize Gotify
    useGotify().init()

    const settingsStore = useUiSettingsStore()

    const init = async () => {

        await Promise.all([
            agentsState.loadAgents(),
            sessionsState.loadSessions(),
            loadModels()
        ])

        // 加载完 agents 后，如果还没有选中的 agent，自动选择第一个
        if (!chatState.agentsSelectedId && agentsState.agentsList.length > 0) {
            chatState.selectAgent(agentsState.agentsList[0].id)
        }

        initConvexConnection()
    }

    return {
        init
    }
}
