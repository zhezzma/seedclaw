<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useSkillsState } from '../composables/useSkillsState'
import { useToast } from '../composables/useToast'
import { useI18n } from 'vue-i18n'
import {
    CpuChipIcon,
    TrashIcon,
    ArrowPathIcon,
    PencilSquareIcon,
    CheckIcon,
    XMarkIcon
} from '@heroicons/vue/24/outline'

const skillsState = useSkillsState()
const toast = useToast()
const { t } = useI18n()

const loading = computed(() => skillsState.skillsLoading)
const skills = computed(() => skillsState.skillsReport?.skills || [])

onMounted(async () => {
    await loadSkills()
})

const loadSkills = async () => {
    await skillsState.loadSkills('main') // Load for main agent by default
}

const toggleSkill = async (skill: any) => {
    try {
        await skillsState.updateSkillEnabled('main', skill.id, !skill.enabled)
        toast.success(t('common.saved'))
    } catch (e: any) {
        toast.error(e.message || String(e))
    }
}

// Edit API Key Logic
const editingSkillId = ref<string | null>(null)
const editApiKeyValue = ref('')

const startEdit = (skill: any) => {
    editingSkillId.value = skill.id
    // If we had the existing key, we'd pre-fill, but usually keys are hidden.
    // So we invoke an edit mode where user enters a new key.
    editApiKeyValue.value = ''
}

const cancelEdit = () => {
    editingSkillId.value = null
    editApiKeyValue.value = ''
}

const saveApiKey = async (skill: any) => {
    if (!editApiKeyValue.value) return
    try {
        // We use updateSkillEdit to set the value in state before saving?
        // Or directly pass it?
        // useSkillsState has `saveSkillApiKey(agentId, skillId, settings)` and `updateSkillEdit(skillKey, value)` 
        // which populates `skillEdits`. `saveSkillApiKey` reads from `skillEdits`.

        skillsState.updateSkillEdit(skill.id, editApiKeyValue.value)
        await skillsState.saveSkillApiKey('main', skill.id)

        toast.success(t('common.saved'))
        editingSkillId.value = null
    } catch (e: any) {
        toast.error(e.message || String(e))
    }
}

const deleteSkill = async (skill: any) => {
    if (!confirm(t('common.confirmDelete'))) return
    try {
        await skillsState.deleteSkill('main', skill.id)
        toast.success(t('common.deleted'))
    } catch (e: any) {
        toast.error(e.message || String(e))
    }
}
</script>

<template>
    <div class="p-6 h-full flex flex-col overflow-hidden">
        <div class="flex justify-between items-center mb-6">
            <div>
                <h1 class="text-2xl font-bold flex items-center gap-2">
                    <CpuChipIcon class="w-8 h-8 text-primary" />
                    {{ $t('skills.title') }}
                </h1>
                <p class="text-base-content/60">{{ $t('skills.subtitle') }}</p>
            </div>
            <button @click="loadSkills" class="btn btn-ghost btn-circle" :disabled="loading">
                <ArrowPathIcon class="w-5 h-5" :class="{ 'animate-spin': loading }" />
            </button>
        </div>

        <div class="flex-1 overflow-y-auto bg-base-100 rounded-box border border-base-200">
            <div v-if="loading && !skills.length" class="flex justify-center p-8">
                <span class="loading loading-spinner loading-lg text-primary"></span>
            </div>

            <div v-else-if="!skills.length" class="text-center p-8 text-base-content/50">
                {{ $t('skills.empty') }}
            </div>

            <table v-else class="table table-pin-rows w-full">
                <thead>
                    <tr>
                        <th>{{ $t('common.name') }}</th>
                        <th>{{ $t('common.description') }}</th>
                        <th>{{ $t('common.status') }}</th>
                        <th class="text-right">{{ $t('common.actions') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="skill in skills" :key="skill.id" class="hover">
                        <td class="font-medium">
                            <div class="flex items-center gap-2">
                                {{ skill.name }}
                                <span v-if="skill.scope === 'global'" class="badge badge-xs badge-ghost">Global</span>
                            </div>
                        </td>
                        <td class="text-sm text-base-content/70 max-w-xs truncate" :title="skill.description">
                            {{ skill.description || '-' }}
                        </td>
                        <td>
                            <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="skill.enabled"
                                @change="toggleSkill(skill)" :disabled="skillsState.skillsBusyKey === skill.id" />
                        </td>
                        <td class="text-right">
                            <div class="join justify-end" v-if="editingSkillId === skill.id">
                                <input type="text" v-model="editApiKeyValue" placeholder="API Key"
                                    class="input input-bordered input-sm join-item w-32" />
                                <button class="btn btn-square btn-sm btn-success join-item" @click="saveApiKey(skill)">
                                    <CheckIcon class="w-4 h-4" />
                                </button>
                                <button class="btn btn-square btn-sm btn-ghost join-item" @click="cancelEdit">
                                    <XMarkIcon class="w-4 h-4" />
                                </button>
                            </div>
                            <div class="join justify-end" v-else>
                                <button class="btn btn-ghost btn-sm btn-square" @click="startEdit(skill)"
                                    :title="$t('skills.editApiKey')">
                                    <PencilSquareIcon class="w-4 h-4" />
                                </button>
                                <button class="btn btn-ghost btn-sm btn-square text-error" @click="deleteSkill(skill)"
                                    :title="$t('common.delete')">
                                    <TrashIcon class="w-4 h-4" />
                                </button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
