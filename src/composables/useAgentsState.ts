import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet, apiPost, apiPatch, apiDelete, apiPut, apiUpload, apiPatchMultipart } from './api-client'

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
        vibe?: string
        creature?: string
    }
    skills?: string[]
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

    agentFiles: Record<string, AgentFileInfo>


}

// ==================== State ====================
const state = reactive<AgentsState>({
    agentsSelectedId: '',
    agentsList: [],


    agentFiles: {},


})

const AGENT_FILES = ['AGENTS.md', 'IDENTITY.md', 'SYSTEM.md', 'TOOLS.md', 'BOOTSTRAP.md', 'USER.md', 'MEMORY.md', 'HEARTBEAT.md']

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
                const key = `${agentId}:${fileName}`

                // If content exists in cache, use it to avoid request
                if (state.agentFiles[key] !== undefined) {
                    files.push(state.agentFiles[key])
                    continue
                }

                try {
                    const result = await apiGet<{ file: AgentFileInfo }>(`/api/agents/${agentId}/${fileName}`)
                    if (result?.file) {
                        files.push(result.file)
                        // Update cache
                        if (result.file) {
                            state.agentFiles[key] = result.file
                        }
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
        if (state.agentsSelectedId === params.agentId) {
            state.agentsSelectedId = ''
        }
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
