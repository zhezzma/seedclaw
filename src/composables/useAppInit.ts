import { useNotify } from './useNotify'
import { useRoute } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { useAgentsState } from './useAgentsState'
import { useChatState } from './useChatState'
import { useSessionsState } from './useSessionsState'
import { useCronState } from './useCronState'
import { useModelsState } from './useModelsState'
import { useSkillsState } from './useSkillsState'
import { connectServer } from './notify-server-connection'
import { ensureLocalServerLoaded, waitForLocalServerReady, isLocalServerBootFailed } from './local-server'
import { useExecApproval } from './useExecApproval'
import { useCommandState } from './useCommandState'
import { isNewSession } from '../utils/route-helpers'

/**
 * Initializes all domain-specific state composables.
 * By calling these composables, we execute their `ensureInit()` logic
 * which will auto-load data from the HTTP API.
 */
export function useAppInit() {
    const route = useRoute()
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
        // 再等内置服务端端口真正监听（node 冷启动 1~5s，Rust 侧 30s 超时转 failed）：
        // 窗口期内不发任何 API 请求，避免连接拒绝报错刷屏；启动画面由 App 门控展示。
        // 初始启动失败时跳过数据加载，由失败界面的「重启服务」（reload 重走本 init）接管
        await waitForLocalServerReady()
        if (isLocalServerBootFailed()) return

        await Promise.all([
            agentsState.loadAgents(),
            sessionsState.loadSessions(),
            loadModels(),
        ])

        // 加载完 agents 后，如果还没有选中的 agent，自动选择第一个。
        // 冷刷新/书签直接落在 /new?agent=<id> 时，路由 watcher 先于本 init 执行
        // （当时列表为空无法命中），这里兜底补选 query 指定的 agent（校验存在性），
        // 避免静默落到第一个 agent；非 /new 或 query 无效时维持原行为。
        // 分支由 !agentsSelectedId 守卫：用户已手动选择时不覆盖
        if (!chatState.agentsSelectedId && agentsState.agentsList.length > 0) {
            const requestedAgent = isNewSession(route) && typeof route.query.agent === 'string'
                ? route.query.agent
                : ''
            const targetAgentId = agentsState.agentsList.some(a => a.id === requestedAgent)
                ? requestedAgent
                : agentsState.agentsList[0].id
            chatState.selectAgent(targetAgentId)
            setCurrentAgent(targetAgentId)
            await loadCommands(targetAgentId)
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
