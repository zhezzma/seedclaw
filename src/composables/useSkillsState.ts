import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client'

// ==================== Types ====================
export interface SkillEntry {
    id: string
    path?: string
    name: string
    description?: string
    scope?: 'global' | 'agent'
    enabled: boolean
}

export interface SkillsState {
    connected: boolean
    skillsLoading: boolean
    skillsError: string | null
    skillsReport: { skills: SkillEntry[] } | null
    skillsBusyKey: string | null
    skillMessages: Record<string, string>
    skillEdits: Record<string, string>
}

// ==================== State ====================
const state = reactive<SkillsState>({
    connected: false,
    skillsLoading: false,
    skillsError: null,
    skillsReport: null,
    skillsBusyKey: null,
    skillMessages: {},
    skillEdits: {},
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    state.connected = true
}

// ==================== Export ====================

export function useSkillsState() {
    ensureInit()

    const loadSkills = async (agentId?: string) => {
        state.skillsLoading = true
        state.skillsError = null
        try {
            const id = agentId || 'main'
            const result = await apiGet<{ skills: SkillEntry[] }>(`/api/skills/${id}`)
            state.skillsReport = result || { skills: [] }
        } catch (err: any) {
            state.skillsError = err?.message || String(err)
        } finally {
            state.skillsLoading = false
        }
    }

    const updateSkillEnabled = async (agentId: string, skillId: string, enabled: boolean) => {
        state.skillsBusyKey = skillId
        try {
            await apiPost(`/api/skills/${agentId}/${skillId}`, { enabled })
            // Update local state
            if (state.skillsReport?.skills) {
                const skill = state.skillsReport.skills.find(s => s.id === skillId)
                if (skill) skill.enabled = enabled
            }
        } catch (err: any) {
            state.skillsError = err?.message || String(err)
        } finally {
            state.skillsBusyKey = null
        }
    }

    const saveSkillApiKey = async (agentId: string, skillId: string, settings?: Record<string, any>) => {
        state.skillsBusyKey = skillId
        try {
            const settingsPayload = settings || {}
            // Check if there's a pending edit value
            if (state.skillEdits[skillId]) {
                settingsPayload['API_KEY'] = state.skillEdits[skillId]
            }
            await apiPatch(`/api/skills/${agentId}/${skillId}`, { settings: settingsPayload })
            // Clear edit
            delete state.skillEdits[skillId]
            state.skillMessages[skillId] = 'Settings saved'
        } catch (err: any) {
            state.skillsError = err?.message || String(err)
        } finally {
            state.skillsBusyKey = null
        }
    }

    const updateSkillEdit = (skillKey: string, value: string) => {
        state.skillEdits[skillKey] = value
    }

    const deleteSkill = async (agentId: string, skillId: string) => {
        state.skillsBusyKey = skillId
        try {
            await apiDelete(`/api/skills/${agentId}/${skillId}`)
            // Remove from local state
            if (state.skillsReport?.skills) {
                state.skillsReport.skills = state.skillsReport.skills.filter(s => s.id !== skillId)
            }
        } catch (err: any) {
            state.skillsError = err?.message || String(err)
        } finally {
            state.skillsBusyKey = null
        }
    }

    const methods = {
        loadSkills,
        saveSkillApiKey,
        updateSkillEdit,
        updateSkillEnabled,
        deleteSkill,
    }

    return createStateProxy(state, methods)
}
