import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import type { SkillsState } from '../openclaw/ui/src/ui/controllers/skills'
import {
    loadSkills as _loadSkills,
    saveSkillApiKey as _saveSkillApiKey,
    updateSkillEdit as _updateSkillEdit,
    updateSkillEnabled as _updateSkillEnabled,
    installSkill as _installSkill
} from '~openclaw/ui/src/ui/controllers/skills'

const state = reactive<SkillsState>({
    client: null,
    connected: false,
    skillsLoading: false,
    skillsError: null,
    skillsReport: null,
    skillsBusyKey: null,
    skillMessages: {},
    skillEdits: {}
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], () => {
        state.client = gatewayStore.client as any
        state.connected = gatewayStore.connected
    }, { immediate: true })
}

export function useSkillsState() {
    ensureInit()

    const loadSkills = async () => {
        await _loadSkills(state as any)
    }

    const saveSkillApiKey = async (skillKey: string) => {
        await _saveSkillApiKey(state as any, skillKey)
    }

    const updateSkillEdit = async (skillKey: string, value: string) => {
        _updateSkillEdit(state as any, skillKey, value)
    }

    const updateSkillEnabled = async (skillId: string, enabled: boolean) => {
        await _updateSkillEnabled(state as any, skillId, enabled)
    }

    const installSkill = async (option: any) => {
        await _installSkill(state as any, option.skillKey, option.skillName, option.optionId)
    }

    return reactive({
        ...toRefs(state),
        loadSkills,
        saveSkillApiKey,
        updateSkillEdit,
        updateSkillEnabled,
        installSkill
    })

}
