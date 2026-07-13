import { reactive } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from './api-client'


export interface SubagentToolsConfig {
    type: "inherit" | "custom"
    deniedTools?: string[]
}

export interface SubagentSkillsConfig {
    type: "inherit" | "custom" | "none"
    disabledSkills?: string[]
}

export type SubagentThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface SubagentConfig {
    id: string
    name: string
    description: string
    provider?: string
    model?: string
    /**
     * 思考程度；undefined = 继承父 agent/session。
     * 服务端返回不会出现 null；null 仅出现在 SubagentSaveInput 中用于显式清空。
     */
    thinkingLevel?: SubagentThinkingLevel
    tools?: SubagentToolsConfig
    skills?: SubagentSkillsConfig
    systemPrompt: string
    filePath?: string
}

/**
 * 创建/更新子代理的 wire 层输入。
 * thinkingLevel 允许三态：
 *   - 具体等级 -> 设置/覆盖
 *   - null         -> 显式清空（服务端 PUT 路由用 "in body" 检测区分未传/清空）
 *   - undefined    -> 未传，服务端保留 existing
 */
export type SubagentSaveInput = Omit<Partial<SubagentConfig>, 'thinkingLevel'> & {
    thinkingLevel?: SubagentThinkingLevel | null
}

export interface SubagentsState {
    list: SubagentConfig[]
    loading: boolean
}

const state = reactive<SubagentsState>({
    list: [],
    loading: false
})

// ==================== Actions ====================

const loadSubagents = async (agentId: string) => {
    state.loading = true
    try {
        const result = await apiGet<SubagentConfig[]>(`/api/subagents/${agentId}`)
        state.list = result || []
        return state.list
    } catch (err: any) {
        console.error(`Failed to load subagents for agent ${agentId}:`, err)
        state.list = []
        throw err
    } finally {
        state.loading = false
    }
}

const getSubagent = async (agentId: string, id: string) => {
    try {
        const result = await apiGet<SubagentConfig>(`/api/subagents/${agentId}/${id}`)
        return result
    } catch (err: any) {
        console.error(`Failed to get subagent ${id} for agent ${agentId}:`, err)
        throw err
    }
}

const createSubagent = async (agentId: string, data: SubagentSaveInput) => {
    try {
        const result = await apiPost<SubagentConfig>(`/api/subagents/${agentId}`, data)
        state.list.push(result)
        return result
    } catch (err: any) {
        console.error(`Failed to create subagent for agent ${agentId}:`, err)
        throw err
    }
}

const updateSubagent = async (agentId: string, id: string, data: SubagentSaveInput) => {
    try {
        const result = await apiPut<SubagentConfig>(`/api/subagents/${agentId}/${id}`, data)
        const index = state.list.findIndex(s => s.id === id)
        if (index !== -1) {
            state.list[index] = result
        }
        return result
    } catch (err: any) {
        console.error(`Failed to update subagent ${id} for agent ${agentId}:`, err)
        throw err
    }
}

const deleteSubagent = async (agentId: string, id: string) => {
    try {
        await apiDelete(`/api/subagents/${agentId}/${id}`)
        state.list = state.list.filter(s => s.id !== id)
    } catch (err: any) {
        console.error(`Failed to delete subagent ${id} for agent ${agentId}:`, err)
        throw err
    }
}

const _subAgentsState = Object.assign(state, {
    loadSubagents,
    getSubagent,
    createSubagent,
    updateSubagent,
    deleteSubagent
})

export function useSubAgents() {
    return _subAgentsState
}

