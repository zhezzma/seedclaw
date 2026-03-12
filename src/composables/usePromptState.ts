import { reactive } from 'vue'

import { apiGet, apiPost, apiDelete } from './api-client'
import { useCommandState } from './useCommandState'

// ==================== Types ====================

export interface PromptInfo {
    id: string
    name: string
    description: string
    content: string
    filePath: string
    scope: 'system' | 'global' | 'agent'
}

interface PromptState {
    systemPrompts: PromptInfo[]
    globalPrompts: PromptInfo[]
    agentPrompts: Record<string, PromptInfo[]>
    loading: boolean
}

// ==================== State ====================
const state = reactive<PromptState>({
    systemPrompts: [],
    globalPrompts: [],
    agentPrompts: {},
    loading: false,
})

// ==================== Export ====================


// ==================== Actions ====================

// ── System Prompts (read-only) ──

const loadSystemPrompts = async () => {
    try {
        state.loading = true
        const res = await apiGet<{ prompts: PromptInfo[] }>('/api/prompts/system')
        state.systemPrompts = res?.prompts || []
    } catch (err) {
        console.error('Failed to load system prompts:', err)
        state.systemPrompts = []
    } finally {
        state.loading = false
    }
}

// ── Global Prompts (CRUD) ──

const loadGlobalPrompts = async () => {
    try {
        state.loading = true
        const res = await apiGet<{ prompts: PromptInfo[] }>('/api/prompts/global')
        state.globalPrompts = res?.prompts || []
    } catch (err) {
        console.error('Failed to load global prompts:', err)
        state.globalPrompts = []
    } finally {
        state.loading = false
    }
}

const getGlobalPrompt = async (promptId: string) => {
    try {
        const res = await apiGet<{ prompt: PromptInfo }>(`/api/prompts/global/${promptId}`)
        return res?.prompt || null
    } catch (err) {
        console.error('Failed to get global prompt:', err)
        return null
    }
}

const saveGlobalPrompt = async (data: { id: string; name: string; description?: string; content: string }) => {
    await apiPost('/api/prompts/global', data)
    await loadGlobalPrompts()
    useCommandState().addOrUpdateCommand({
        name: data.id,
        description: data.description || '',
        source: 'prompt',
        extensionPath: undefined,
    })
}

const deleteGlobalPrompt = async (promptId: string) => {
    await apiDelete(`/api/prompts/global/${promptId}`)
    await loadGlobalPrompts()
    useCommandState().removeCommand(promptId)
}

// ── Agent Prompts (CRUD) ──

const loadAgentPrompts = async (agentId: string) => {
    try {
        const res = await apiGet<{ prompts: PromptInfo[] }>(`/api/prompts/${agentId}`)
        state.agentPrompts[agentId] = res?.prompts || []
        return state.agentPrompts[agentId]
    } catch (err) {
        console.error(`Failed to load prompts for agent ${agentId}:`, err)
        state.agentPrompts[agentId] = []
        return []
    }
}

const getAgentPrompt = async (agentId: string, promptId: string) => {
    try {
        const res = await apiGet<{ prompt: PromptInfo }>(`/api/prompts/${agentId}/${promptId}`)
        return res?.prompt || null
    } catch (err) {
        console.error('Failed to get agent prompt:', err)
        return null
    }
}

const saveAgentPrompt = async (agentId: string, data: { id: string; name: string; description?: string; content: string }) => {
    await apiPost(`/api/prompts/${agentId}`, data)
    await loadAgentPrompts(agentId)
    useCommandState().addOrUpdateCommand({
        name: data.id,
        description: data.description || '',
        source: 'prompt',
        extensionPath: undefined,
    })
}

const deleteAgentPrompt = async (agentId: string, promptId: string) => {
    await apiDelete(`/api/prompts/${agentId}/${promptId}`)
    await loadAgentPrompts(agentId)
    useCommandState().removeCommand(promptId)
}

const _promptState = Object.assign(state, {
    loadSystemPrompts,
    loadGlobalPrompts,
    getGlobalPrompt,
    saveGlobalPrompt,
    deleteGlobalPrompt,
    loadAgentPrompts,
    getAgentPrompt,
    saveAgentPrompt,
    deleteAgentPrompt,
})

export function usePromptState() {
    return _promptState
}

