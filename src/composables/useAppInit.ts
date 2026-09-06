import { useNotify } from './useNotify'
import { useUiSettingsStore } from '../stores/setting'
import { useAgentsState } from './useAgentsState'
import { useChatState } from './useChatState'
import { useSessionsState } from './useSessionsState'
import { useCronState } from './useCronState'
import { useModelsState } from './useModelsState'
import { useSkillsState } from './useSkillsState'
import { connectServer } from './notify-server-connection'
import { ensureLocalServerLoaded } from './local-server'
import { useExecApproval } from './useExecApproval'
import { useCommandState } from './useCommandState'

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
    const { loadCommands, setCurrentAgent } = useCommandState()
    useCronState()
    useNotify()
    useExecApproval()
    useUiSettingsStore()

    const init = async () => {
        // 本地网关模式下先等内置服务端状态就绪（会把托管地址回填进 settings）：
        // init() 在 App setup 里与路由守卫并发执行，若不等待，首启时 localStorage
        // 里残留的旧远程 apiBaseUrl 会被下面的数据加载抢先使用
        await ensureLocalServerLoaded()

        await Promise.all([
            agentsState.loadAgents(),
            sessionsState.loadSessions(),
            loadModels(),
        ])

        // 加载完 agents 后，如果还没有选中的 agent，自动选择第一个
        if (!chatState.agentsSelectedId && agentsState.agentsList.length > 0) {
            chatState.selectAgent(agentsState.agentsList[0].id)
            setCurrentAgent(agentsState.agentsList[0].id)
            await loadCommands(agentsState.agentsList[0].id)
        } else {
            setCurrentAgent(chatState.agentsSelectedId || undefined)
            await loadCommands(chatState.agentsSelectedId || undefined)
        }

        initConvexConnection()
        connectServer()
    }

    return {
        init
    }
}
