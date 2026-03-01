import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client'
import { clawHubClient, type ConvexSkill, type ConnectionStatus } from './clawhub-client'

// ==================== Types ====================

export interface SkillsState {
    skillsBusyKey: string | null
    skillMessages: Record<string, string>
    skillEdits: Record<string, string>
    publicSkills: ConvexSkill[]
    publicSkillsLoading: boolean
    connectionStatus: ConnectionStatus
}

// ==================== State ====================
const state = reactive<SkillsState>({
    skillsBusyKey: null,
    skillMessages: {},
    skillEdits: {},
    publicSkills: [],
    publicSkillsLoading: false,
    connectionStatus: 'disconnected',
})

// ==================== Init Callbacks ====================
clawHubClient.setCallbacks({
    onStatusChange: (status) => {
        state.connectionStatus = status
    },
    onPublicSkillsUpdated: (skills) => {
        state.publicSkills = skills
    },
    onReadmeReceived: (_, text) => {
        if (state.skillsBusyKey) {
            state.skillMessages[state.skillsBusyKey] = text
            state.skillsBusyKey = null
        }
    },
    onSearchFinished: (skills) => {
        state.publicSkills = skills
    },
    onLoadingState: (loading) => {
        state.publicSkillsLoading = loading
    }
})

// ==================== Export ====================

export function useSkillsState() {

    const initConvexConnection = () => {
        clawHubClient.init()
    }

    const fetchPublicSkills = async (options: { sort?: string } = {}) => {
        await clawHubClient.fetchPublicSkills(options)
    }

    const getSkillReadme = async (versionId: string) => {
        state.skillsBusyKey = versionId
        state.skillMessages[versionId] = ''
        await clawHubClient.getSkillReadme(versionId)
    }

    const searchSkills = async (query: string) => {
        await clawHubClient.searchSkills(query)
    }

    const installSkill = async (skillName: string, agentId?: string) => {
        try {
            const body = { name: skillName }
            if (agentId) {
                await apiPost(`/api/skills/${agentId}/install`, body)
            } else {
                await apiPost('/api/skills/global/install', body)
            }
        } catch (err: any) {
            console.error('Failed to install skill:', err)
            throw err
        }
    }

    const fetchGlobalSkills = async (agentId?: string) => {
        try {
            const query = agentId ? `?agentId=${agentId}` : ''
            const res = await apiGet<{ skills: any[] }>(`/api/skills/global${query}`)
            return res?.skills || []
        } catch (err) {
            console.error('Failed to fetch global skills:', err)
            return []
        }
    }

    const uninstallGlobalSkill = async (skillId: string) => {
        try {
            await apiDelete(`/api/skills/global/${skillId}`)
        } catch (err) {
            console.error('Failed to uninstall global skill:', err)
            throw err
        }
    }

    const loadAgentSkills = async (agentId: string) => {
        try {
            const result = await apiGet<{ skills: any[] }>(`/api/skills/${agentId}`)
            return result?.skills || []
        } catch (err: any) {
            console.error(`Failed to load skills for agent ${agentId}:`, err)
            return []
        }
    }

    const toggleAgentSkill = async (agentId: string, skillId: string, enabled: boolean) => {
        await apiPost(`/api/skills/${agentId}/${skillId}`, { enabled })
    }

    const uninstallAgentSkill = async (agentId: string, skillId: string) => {
        try {
            await apiDelete(`/api/skills/${agentId}/${skillId}`)
        } catch (err: any) {
            throw err
        }
    }

    const fetchSystemSkills = async (agentId?: string) => {
        try {
            const query = agentId ? `?agentId=${agentId}` : ''
            const res = await apiGet<{ skills: any[] }>(`/api/skills/system${query}`)
            return res?.skills || []
        } catch (err) {
            console.error('Failed to fetch system skills:', err)
            return []
        }
    }

    const methods = {
        initConvexConnection,
        fetchPublicSkills,
        searchSkills,
        getSkillReadme,
        installSkill,
        fetchGlobalSkills,
        fetchSystemSkills,
        uninstallGlobalSkill,
        loadAgentSkills,
        toggleAgentSkill,
        uninstallAgentSkill
    }

    return createStateProxy(state, methods)
}

