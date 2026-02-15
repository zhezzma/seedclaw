import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet, apiPost, apiPatch, apiDelete, apiPut, apiUpload } from './api-client'

// ==================== Types ====================
export interface AgentInfo {
    id: string
    name?: string
    description?: string
    agentDir?: string
    workspaceDir?: string
    avatar?: string
    defaultProvider?: string
    defaultModel?: string
    steeringMode?: string
    followUpMode?: string
    compaction?: boolean
    branchSummary?: boolean
    retry?: number
    hideThinkingBlock?: boolean
    sessionId?: string
    createdAt?: string
    lastActiveAt?: string
    identity?: {
        name?: string
        emoji?: string
    }
}

export interface AgentFileInfo {
    name: string
    path: string
    missing: boolean
    size?: number
    updatedAtMs?: number
    content?: string
}

export interface AgentsState {
    agentsSelectedId: string
    agentsList: AgentInfo[],
    // Agent files state
    agentFilesList: AgentFileInfo[] | null
    agentFileContents: Record<string, string>
    agentFileDrafts: Record<string, string>
    agentFileActive: string | null
}

// ==================== State ====================
const state = reactive<AgentsState>({
    agentsSelectedId: '',
    agentsList: [],

    agentFilesList: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileActive: null,
})

const AGENT_FILES = ['AGENTS', 'IDENTITY', 'SYSTEM', 'TOOLS', 'BOOTSTRAP', 'USER', 'MEMORY']

// ==================== Export ====================

export function useAgentsState() {
    const loadAgents = async () => {
        const agents = await apiGet<AgentInfo[]>('/api/agents')
        state.agentsList = agents || []
    }

    const initAgents = async () => {
        await loadAgents()
        // Auto-select first agent if none selected
        if (!state.agentsSelectedId && state.agentsList.length > 0) {
            state.agentsSelectedId = state.agentsList[0].id
        }
    }

    const loadAgentFiles = async (agentId: string) => {

        try {
            const files: AgentFileInfo[] = []
            for (const fileName of AGENT_FILES) {
                try {
                    const result = await apiGet<{ file: AgentFileInfo }>(`/api/agents/${agentId}/${fileName}`)
                    if (result?.file) {
                        files.push(result.file)
                    }
                } catch {
                    files.push({ name: `${fileName}.md`, path: '', missing: true })
                }
            }
            state.agentFilesList = files
        } catch (err: any) {
            console.error(err?.message || String(err))
        }
    }

    const loadAgentFileContent = async (agentId: string, name: string, opts?: { force?: boolean; preserveDraft?: boolean }) => {
        const key = `${agentId}:${name}`
        if (!opts?.force && state.agentFileContents[key]) return
        try {
            const result = await apiGet<{ file: AgentFileInfo }>(`/api/agents/${agentId}/${name}`)
            if (result?.file?.content !== undefined) {
                state.agentFileContents[key] = result.file.content
                if (!opts?.preserveDraft) {
                    state.agentFileDrafts[key] = result.file.content
                }
            }
        } catch (err: any) {
            console.error(`Failed to load file ${name} for agent ${agentId}:`, err)
        }
    }

    const saveAgentFile = async (agentId: string, name: string, content: string) => {

        try {
            await apiPut(`/api/agents/${agentId}/${name}`, { content })
            const key = `${agentId}:${name}`
            state.agentFileContents[key] = content
            state.agentFileDrafts[key] = content
        } catch (err: any) {
            throw err
        }
    }

    const createAgent = async (params: { id: string; name?: string; description?: string; defaultModel?: string; defaultProvider?: string; avatar?: string }) => {
        const res = await apiPost('/api/agents', params)
        await loadAgents()
        return res
    }

    const updateAgent = async (params: { agentId: string; name?: string; description?: string; defaultModel?: string; avatar?: string }) => {
        const { agentId, ...body } = params
        const res = await apiPatch(`/api/agents/${agentId}`, body)
        await loadAgents()
        return res
    }

    const deleteAgent = async (params: { agentId: string; deleteFiles?: boolean }) => {
        const query = params.deleteFiles ? '?deleteFiles=true' : ''
        const res = await apiDelete(`/api/agents/${params.agentId}${query}`)
        await loadAgents()
        return res
    }

    const methods = {
        initAgents,
        loadAgents,
        loadAgentFiles,
        loadAgentFileContent,
        saveAgentFile,
        createAgent,
        updateAgent,
        deleteAgent,
    }

    return createStateProxy(state, methods)
}
