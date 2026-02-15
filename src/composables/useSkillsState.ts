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
    globalSkills: any[]
}

// ==================== State ====================
const state = reactive<SkillsState>({
    skillsBusyKey: null,
    skillMessages: {},
    skillEdits: {},
    publicSkills: [],
    publicSkillsLoading: false,
    connectionStatus: 'disconnected',
    globalSkills: [],
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
                await fetchGlobalSkills()
            }
            return true
        } catch (err: any) {
            console.error('Failed to install skill:', err)
            throw err
        }
    }

    const fetchGlobalSkills = async () => {
        try {
            const res = await apiGet<{ skills: any[] }>('/api/skills/global')
            state.globalSkills = res?.skills || []
        } catch (err) {
            console.error('Failed to fetch global skills:', err)
        }
    }

    const uninstallGlobalSkill = async (skillId: string) => {
        try {
            await apiDelete(`/api/skills/global/${skillId}`)
            await fetchGlobalSkills()
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
        try {
            await apiPost(`/api/skills/${agentId}/${skillId}`, { enabled })
        } catch (err: any) {
            throw err
        }
    }

    const uninstallAgentSkill = async (agentId: string, skillId: string) => {
        try {
            await apiDelete(`/api/skills/${agentId}/${skillId}`)
        } catch (err: any) {
            throw err
        }
    }

    const methods = {
        initConvexConnection,
        fetchPublicSkills,
        searchSkills,
        getSkillReadme,
        installSkill,
        fetchGlobalSkills,
        uninstallGlobalSkill,
        loadAgentSkills,
        toggleAgentSkill,
        uninstallAgentSkill
    }

    return createStateProxy(state, methods)
}

