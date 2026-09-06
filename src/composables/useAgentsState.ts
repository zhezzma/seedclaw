import { reactive } from 'vue'

import type { DeliveryTarget } from '../utils/delivery-targets'
import { apiGet, apiPost, apiPatch, apiDelete, apiPut, apiUpload, apiPatchMultipart } from './api-client'

// ==================== Types ====================
export interface CompactionSettings {
    enabled?: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
}

export interface BranchSummarySettings {
    reserveTokens?: number;
    skipPrompt?: boolean;
}

export interface RetrySettings {
    enabled?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
}

export interface AgentInfo {
    id: string
    name?: string
    description?: string
    agentDir?: string
    workspaceDir?: string
    workspaceDirRaw?: string | null
    avatar?: string
    defaultProvider?: string
    defaultModel?: string
    defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
    defaultProjectTrust?: 'always' | 'never' | 'ask'
    steeringMode?: "all" | "one-at-a-time" | string
    followUpMode?: "all" | "one-at-a-time" | string
    compaction?: boolean | CompactionSettings
    branchSummary?: boolean | BranchSummarySettings
    retry?: number | RetrySettings
    hideThinkingBlock?: boolean
    heartbeat?: {
        every?: string
        sessionMode?: 'singleSession' | 'newSession'
        deliveryTargets?: DeliveryTarget[]
    }
    sessionId?: string
    createdAt?: string
    lastActiveAt?: string
    identity?: {
        name?: string
        emoji?: string
        vibe?: string
        creature?: string
    }
    skills?: string[]
    allowPeerAccess?: boolean
}

export interface AgentFileInfo {
    name: string
    path: string
    missing: boolean
    size?: number
    updatedAtMs?: number
    content?: string
}

export interface AgentTool {
    name: string
    description?: string
    parameters?: any
    active: boolean
    denied: boolean
}

export interface AgentsState {
    agentsList: AgentInfo[],
    // Agent files state
    agentFiles: Record<string, AgentFileInfo>
    // Agent tools state
    agentTools: Record<string, AgentTool[]>
    agentToolsBusy: Record<string, boolean>
}

// ==================== State ====================
const state = reactive<AgentsState>({
    agentsList: [],
    agentFiles: {},
    agentTools: {},
    agentToolsBusy: {},
})

// File Definitions
export const AGENT_FILE_DEFINITIONS = [
    {
        groupKey: 'agent.roleSettings',
        files: [
            { name: 'AGENTS.md', labelKey: 'agent.files.agent' },
            { name: 'SYSTEM.md', labelKey: 'agent.files.system' },
            { name: 'IDENTITY.md', labelKey: 'agent.files.identity' },
            { name: 'USER.md', labelKey: 'agent.files.user' },
        ]
    },
    {
        groupKey: 'agent.capabilitySettings',
        files: [
            { name: 'TOOLS.md', labelKey: 'agent.files.tools' },
            { name: 'HEARTBEAT.md', labelKey: 'agent.files.heartbeat' },
            { name: 'BOOTSTRAP.md', labelKey: 'agent.files.bootstrap' },
        ]
    }
]

const AGENT_FILES = AGENT_FILE_DEFINITIONS.flatMap(g => g.files.map(f => f.name))

// ==================== Export ====================

// ==================== Actions ====================

const loadAgents = async () => {
    const agents = await apiGet<AgentInfo[]>('/api/agents')
    state.agentsList = agents || []
}

const loadAgentFiles = async (agentId: string) => {
    try {
        const files: AgentFileInfo[] = []
        for (const fileName of AGENT_FILES) {
            const key = `${agentId}:${fileName}`
            if (state.agentFiles[key] !== undefined) {
                files.push(state.agentFiles[key])
                continue
            }
            try {
                const result = await apiGet<{ file: AgentFileInfo }>(`/api/agents/${agentId}/${fileName}`)
                if (result?.file) {
                    files.push(result.file)
                    if (result.file) {
                        state.agentFiles[key] = result.file
                    }
                } else {
                    state.agentFiles[key] = { name: fileName, path: '', missing: true }
                    files.push({ name: fileName, path: '', missing: true })
                }
            } catch {
                state.agentFiles[key] = { name: fileName, path: '', missing: true }
                files.push({ name: fileName, path: '', missing: true })
            }
        }
        return files
    } catch (err: any) {
        console.error(err?.message || String(err))
        return []
    }
}

const loadAgentFileContent = async (agentId: string, name: string) => {
    const key = `${agentId}:${name}`
    try {
        const result = await apiGet<{ file: AgentFileInfo }>(`/api/agents/${agentId}/${name}`)
        if (result?.file) {
            state.agentFiles[key] = result.file
        }
    } catch (err: any) {
        console.error(`Failed to load file ${name} for agent ${agentId}:`, err)
    }
}

const saveAgentFile = async (agentId: string, name: string, content: string) => {
    try {
        const result = await apiPut<{ file: AgentFileInfo }>(`/api/agents/${agentId}/${name}`, { content })
        const key = `${agentId}:${name}`
        if (result?.file) {
            state.agentFiles[key] = result.file
        }
    } catch (err: any) {
        throw err
    }
}

const createAgent = async (params: FormData | any) => {
    let res
    if (params instanceof FormData) {
        res = await apiUpload<AgentInfo>('/api/agents', params)
    } else {
        res = await apiPost<AgentInfo>('/api/agents', params)
    }
    if (res) {
        state.agentsList.push(res)
    }
    return res
}

const updateAgent = async (params: FormData | ({ agentId: string } & Record<string, any>)) => {
    let res
    if (params instanceof FormData) {
        const agentId = params.get('id') as string
        if (!agentId) throw new Error("Agent ID is required")
        res = await apiPatchMultipart<AgentInfo>(`/api/agents/${agentId}`, params)
    } else {
        const { agentId, ...body } = params
        res = await apiPatch<AgentInfo>(`/api/agents/${agentId}`, body)
    }
    if (res) {
        const index = state.agentsList.findIndex(a => a.id === res.id)
        if (index !== -1) {
            state.agentsList[index] = res
        }
    }
    return res
}

const deleteAgent = async (params: { agentId: string; deleteFiles?: boolean }) => {
    const res = await apiDelete(`/api/agents/${params.agentId}`)
    state.agentsList = state.agentsList.filter(a => a.id !== params.agentId)
    return res
}

const loadAgentTools = async (agentId: string) => {
    state.agentToolsBusy[agentId] = true
    try {
        const res = await apiGet<{
            tools: { name: string, description?: string, parameters?: any }[],
            activeToolNames: string[],
            deniedTools: string[]
        }>(`/api/agents/${agentId}/tools`)

        if (res) {
            state.agentTools[agentId] = res.tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
                active: res.activeToolNames.includes(t.name),
                denied: res.deniedTools.includes(t.name)
            }))
        }
    } catch (err: any) {
        console.error(`Failed to load tools for agent ${agentId}:`, err)
    } finally {
        state.agentToolsBusy[agentId] = false
    }
}

const toggleAgentTool = async (agentId: string, toolName: string, enable: boolean) => {
    try {
        const tools = state.agentTools[agentId]
        if (tools) {
            const tool = tools.find(t => t.name === toolName)
            if (tool) {
                tool.denied = !enable
                tool.active = enable
            }
        }
        const body = enable ? { enable: [toolName] } : { disable: [toolName] }
        await apiPatch<{ deniedTools: string[] }>(`/api/agents/${agentId}/tools`, body)
        await loadAgentTools(agentId)
    } catch (err: any) {
        console.error(`Failed to toggle tool ${toolName} for agent ${agentId}:`, err)
        await loadAgentTools(agentId)
    }
}

const _agentsState = Object.assign(state, {
    loadAgents,
    loadAgentFiles,
    loadAgentFileContent,
    saveAgentFile,
    createAgent,
    updateAgent,
    deleteAgent,
    loadAgentTools,
    toggleAgentTool,
})

export function useAgentsState() {
    return _agentsState
}

