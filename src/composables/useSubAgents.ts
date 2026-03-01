import { reactive } from 'vue'
import { apiGet, apiPost, apiPut, apiDelete } from './api-client'
import { createStateProxy } from './utils/stateProxy'

export interface SubagentToolsConfig {
    type: "inherit" | "custom"
    deniedTools?: string[]
}

export interface SubagentSkillsConfig {
    type: "inherit" | "custom" | "none"
    disabledSkills?: string[]
}

export interface SubagentConfig {
    id: string
    name: string
    description: string
    provider?: string
    model?: string
    tools?: SubagentToolsConfig
    skills?: SubagentSkillsConfig
    systemPrompt: string
    filePath?: string
}

export interface SubagentsState {
    list: SubagentConfig[]
    loading: boolean
}

export function useSubAgents() {
    const state = reactive<SubagentsState>({
        list: [],
        loading: false
    })

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

    const createSubagent = async (agentId: string, data: Partial<SubagentConfig>) => {
        try {
            const result = await apiPost<SubagentConfig>(`/api/subagents/${agentId}`, data)
            state.list.push(result)
            return result
        } catch (err: any) {
            console.error(`Failed to create subagent for agent ${agentId}:`, err)
            throw err
        }
    }

    const updateSubagent = async (agentId: string, id: string, data: Partial<SubagentConfig>) => {
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

    return createStateProxy(state, {
        loadSubagents,
        getSubagent,
        createSubagent,
        updateSubagent,
        deleteSubagent
    })
}
