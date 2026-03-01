import { reactive, computed } from 'vue'
import { apiGet } from './api-client'

// ==================== Types ====================

/** 服务器返回的单条命令信息 */
export interface CommandInfo {
    name: string
    description?: string
    usage?: string
    source?: 'builtin' | 'extension'
    [key: string]: any
}

/** /api/commands 响应体 */
interface CommandsResponse {
    commands: CommandInfo[]
    total: number
    builtinCount: number
    extensionCount: number
}

// ==================== State ====================

const state = reactive<{
    commands: CommandInfo[]
    loaded: boolean
    loading: boolean
}>({
    commands: [],
    loaded: false,
    loading: false,
})

// ==================== Derived Computeds & Actions（模块级，仅初始化一次）====================

const loadCommands = async (agentId?: string) => {
    if (state.loading) return
    state.loading = true
    try {
        const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''
        const result = await apiGet<CommandsResponse>(`/api/commands${query}`)
        state.commands = result?.commands ?? []
        state.loaded = true
    } catch (err) {
        console.error('[useCommandState] 获取命令列表失败:', err)
    } finally {
        state.loading = false
    }
}

/** 根据输入前缀过滤命令（输入 `/foo` 则匹配所有以 `foo` 开头的命令） */
const filterCommands = computed(() => (prefix: string) => {
    const lc = prefix.toLowerCase()
    return state.commands.filter(cmd =>
        cmd.name.toLowerCase().startsWith(lc)
    )
})

const allCommands = computed(() => state.commands)
const isLoaded = computed(() => state.loaded)

const _commandState = {
    allCommands,
    isLoaded,
    loadCommands,
    filterCommands,
}

export function useCommandState() {
    return _commandState
}

