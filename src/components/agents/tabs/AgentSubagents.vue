<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSubAgents, SubagentConfig } from '@/composables/useSubAgents'
import { useAgentsState } from '@/composables/useAgentsState'
import { useModelsState } from '@/composables/useModelsState'
import { useSkillsState } from '@/composables/useSkillsState'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'
import { PlusIcon, PencilIcon, TrashIcon, UserGroupIcon, CommandLineIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
    agent: any
}>()

const subAgentsState = useSubAgents()
const agentsState = useAgentsState()
const modelsState = useModelsState()
const skillsState = useSkillsState()
const toast = useToast()
const { t } = useI18n()

const loading = ref(false)
const showModal = ref(false)
const isSubmitting = ref(false)

const subagents = computed(() => subAgentsState.list)
const availableTools = computed(() => {
    if (!props.agent?.id) return []
    return (agentsState.agentTools[props.agent.id] || []).filter((t: any) => t.name !== 'subagent')
})
const availableSkills = ref<any[]>([])

const availableModelGroups = modelsState.availableModels

const selectedModelValue = computed({
    get: () => {
        if (formData.value.provider && formData.value.model) {
            return `${formData.value.provider}/${formData.value.model}`
        }
        return formData.value.model || ''
    },
    set: (val: string) => {
        if (!val) {
            formData.value.provider = ''
            formData.value.model = ''
            return
        }
        if (val.includes('/')) {
            const [p, ...m] = val.split('/')
            formData.value.provider = p
            formData.value.model = m.join('/')
        } else {
            formData.value.model = val
            formData.value.provider = ''
        }
    }
})

// Form Data
const initFormData = (): Partial<SubagentConfig> => ({
    id: '',
    name: '',
    description: '',
    systemPrompt: '',
    model: '',
    tools: { type: 'inherit' },
    skills: { type: 'none' }
})

const formData = ref<Partial<SubagentConfig>>(initFormData())
const isEditing = ref(false)
const editingId = ref('')
const selectedTools = ref<string[]>([])
const selectedSkills = ref<string[]>([])

const loadAvailableSkills = async () => {
    if (!props.agent?.id) return
    try {
        const [agent, global, system] = await Promise.all([
            skillsState.loadAgentSkills(props.agent.id),
            skillsState.fetchGlobalSkills(props.agent.id),
            skillsState.fetchSystemSkills(props.agent.id)
        ])
        availableSkills.value = [...agent, ...global, ...system]
    } catch (e: any) {
        console.error('Failed to load skills:', e)
        availableSkills.value = []
    }
}

watch(() => props.agent?.id, async (newId) => {
    if (modelsState.providers.value.length === 0) {
        modelsState.loadModels()
    }

    if (newId) {
        loading.value = true
        try {
            await subAgentsState.loadSubagents(newId)
            await agentsState.loadAgentTools(newId)
            await loadAvailableSkills()
        } catch (e: any) {
            toast.error(e.message || t('agent.subagents.loadError') || 'Failed to load subagents')
        } finally {
            loading.value = false
        }
    }
}, { immediate: true })

const openAddModal = () => {
    isEditing.value = false
    formData.value = initFormData()
    selectedTools.value = []
    selectedSkills.value = []
    showModal.value = true
}

const openEditModal = (subagent: SubagentConfig) => {
    isEditing.value = true
    editingId.value = subagent.id
    // Deep clone to avoid mutating state
    formData.value = JSON.parse(JSON.stringify(subagent))

    // Fallback if tools/skills are undefined
    if (!formData.value.tools) {
        formData.value.tools = { type: 'inherit' }
    }
    if (!formData.value.skills) {
        formData.value.skills = { type: 'none' }
    }

    if (formData.value.tools.type === 'custom') {
        const denied = formData.value.tools.deniedTools || []
        selectedTools.value = availableTools.value
            .map((t: any) => t.name)
            .filter((name: string) => !denied.includes(name))
    } else {
        selectedTools.value = []
    }

    if (formData.value.skills.type === 'custom') {
        const disabled = formData.value.skills.disabledSkills || []
        selectedSkills.value = availableSkills.value
            .map((s: any) => s.id)
            .filter((id: string) => !disabled.includes(id))
    } else {
        selectedSkills.value = []
    }
    showModal.value = true
}

const closeModal = () => {
    showModal.value = false
    formData.value = initFormData()
}

const saveSubagent = async () => {
    if (!props.agent?.id) return
    if (!formData.value.id || !formData.value.name || !formData.value.description || !formData.value.systemPrompt) {
        toast.error(t('agent.form.errorMissingFields') || 'ID, name, description, and system prompt are required')
        return
    }
    // Validate id: only alphanumeric characters allowed
    if (!/^[a-zA-Z0-9]+$/.test(formData.value.id)) {
        toast.error(t('agent.subagents.idInvalid') || 'ID must contain only letters and numbers')
        return
    }

    isSubmitting.value = true
    try {
        // Convert selectedTools to deniedTools when using 'custom'
        if (formData.value.tools?.type === 'custom') {
            const selected = selectedTools.value
            const denied = availableTools.value
                .map((t: any) => t.name)
                .filter((name: string) => !selected.includes(name))
            formData.value.tools.deniedTools = denied
        } else if (formData.value.tools) {
            delete formData.value.tools.deniedTools
        }

        // Convert selectedSkills to disabledSkills when using 'custom'
        if (formData.value.skills?.type === 'custom') {
            const selected = selectedSkills.value
            const disabled = availableSkills.value
                .map((s: any) => s.id)
                .filter((id: string) => !selected.includes(id))
            formData.value.skills.disabledSkills = disabled
        } else if (formData.value.skills) {
            delete formData.value.skills.disabledSkills
        }

        if (isEditing.value) {
            await subAgentsState.updateSubagent(props.agent.id, editingId.value, formData.value)
            toast.success(t('common.savedSuccess'))
        } else {
            // Check if id already exists in UI
            if (subagents.value.some(s => s.id === formData.value.id)) {
                toast.error(t('agent.subagents.nameExists', { name: formData.value.id }) || `Subagent with id ${formData.value.id} already exists.`)
                return
            }
            await subAgentsState.createSubagent(props.agent.id, formData.value)
            toast.success(t('common.savedSuccess'))
        }
        closeModal()
    } catch (e: any) {
        toast.error(e.message || t('agent.subagents.saveError') || 'Failed to save subagent')
    } finally {
        isSubmitting.value = false
    }
}

const confirmDelete = async (id: string) => {
    if (!props.agent?.id) return
    if (!confirm(t('common.deleteConfirm') || `Are you sure you want to delete subagent ${id}?`)) return

    try {
        await subAgentsState.deleteSubagent(props.agent.id, id)
        toast.success(t('common.deleteSuccess') || 'Deleted successfully')
    } catch (e: any) {
        toast.error(e.message || t('agent.subagents.deleteError') || 'Failed to delete subagent')
    }
}

const toggleToolSelection = (toolName: string) => {
    if (selectedTools.value.includes(toolName)) {
        selectedTools.value = selectedTools.value.filter(t => t !== toolName)
    } else {
        selectedTools.value.push(toolName)
    }
}

const toggleSkillSelection = (skillId: string) => {
    if (selectedSkills.value.includes(skillId)) {
        selectedSkills.value = selectedSkills.value.filter(s => s !== skillId)
    } else {
        selectedSkills.value.push(skillId)
    }
}

const isAllToolsSelected = computed(() => {
    return availableTools.value.length > 0 && availableTools.value.every((t: any) => selectedTools.value.includes(t.name))
})

const toggleAllTools = () => {
    if (isAllToolsSelected.value) {
        selectedTools.value = []
    } else {
        selectedTools.value = availableTools.value.map((t: any) => t.name)
    }
}

const isAllSkillsSelected = computed(() => {
    return availableSkills.value.length > 0 && availableSkills.value.every((s: any) => selectedSkills.value.includes(s.id))
})

const toggleAllSkills = () => {
    if (isAllSkillsSelected.value) {
        selectedSkills.value = []
    } else {
        selectedSkills.value = availableSkills.value.map((s: any) => s.id)
    }
}

</script>

<template>
    <div class="h-full flex flex-col p-4">
        <!-- Header Actions -->
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-bold flex items-center gap-2">
                <UserGroupIcon class="w-5 h-5 text-primary" />
                {{ $t('agent.tab.subagents') || 'Subagents' }}
            </h3>
            <button class="btn btn-primary btn-sm gap-2" @click="openAddModal">
                <PlusIcon class="w-4 h-4" />
                {{ $t('common.add') }}
            </button>
        </div>

        <!-- Content List -->
        <div v-if="loading" class="flex justify-center p-8">
            <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>

        <div v-else-if="subagents.length === 0"
            class="flex flex-col items-center justify-center p-12 text-base-content/50 border-2 border-dashed border-base-200 rounded-2xl">
            <UserGroupIcon class="w-12 h-12 mb-4 opacity-20" />
            <p>{{ $t('agent.subagents.noAgents') || 'No subagents configured yet' }}</p>
            <button class="btn btn-ghost btn-sm mt-4" @click="openAddModal">{{ $t('common.create') }}</button>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="agent in subagents" :key="agent.id"
                class="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md transition-all">
                <div class="card-body p-4">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-lg truncate flex-1" :title="agent.name">{{ agent.name }}</h4>
                        <div class="flex gap-1 shrink-0 ml-2">
                            <button class="btn btn-square btn-ghost btn-xs" @click="openEditModal(agent)"
                                :title="$t('common.edit')">
                                <PencilIcon class="w-4 h-4" />
                            </button>
                            <button class="btn btn-square btn-ghost btn-xs text-error" @click="confirmDelete(agent.id)"
                                :title="$t('common.delete')">
                                <TrashIcon class="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <p class="text-sm text-base-content/70 line-clamp-2 mb-3" :title="agent.description">{{
                        agent.description }}</p>

                    <div class="flex flex-wrap gap-2 mt-auto">
                        <div v-if="agent.model" class="badge badge-outline badge-sm text-xs opacity-70">
                            {{ agent.model }}
                        </div>
                        <div v-if="agent.tools?.type === 'custom'"
                            class="badge badge-primary badge-outline badge-sm text-xs gap-1">
                            <CommandLineIcon class="w-3 h-3" />
                            {{ $t('agent.tools.customTools') || 'Custom Tools' }}
                        </div>
                        <div v-else-if="agent.tools?.type === 'inherit'"
                            class="badge badge-ghost badge-outline badge-sm text-xs gap-1">
                            <CommandLineIcon class="w-3 h-3" />
                            {{ $t('agent.tools.inheritParent') || 'Inherit Parent' }}
                        </div>

                        <div v-if="agent.skills?.type === 'inherit'"
                            class="badge badge-secondary badge-outline badge-sm text-xs gap-1">
                            {{ $t('agent.skills.inherited') || 'Inherit Skills' }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Form Modal -->
        <dialog class="modal" :class="{ 'modal-open': showModal }">
            <div class="modal-box w-11/12 max-w-3xl flex flex-col max-h-[90vh]">
                <h3 class="font-bold text-lg mb-4">{{ isEditing ? ($t('agent.subagents.editTitle') + ' ' + editingId)
                    :
                    $t('agent.subagents.addTitle') || 'Add Subagent' }}</h3>

                <div class="flex-1 overflow-y-auto custom-scrollbar px-1 py-2 space-y-4">
                    <!-- ID -->
                    <div class="form-control w-full">
                        <label class="label"><span class="label-text font-medium">ID <span
                                    class="text-error">*</span></span></label>
                        <input v-model="formData.id" type="text" class="input input-bordered w-full"
                            :disabled="isEditing"
                            :placeholder="$t('agent.subagents.idPlaceholder') || 'e.g. researcher1'" />
                        <label class="label">
                            <span v-if="isEditing" class="label-text-alt text-base-content/50">{{
                                $t('agent.subagents.idEditWarning')
                                || 'ID cannot be changed when editing.' }}</span>
                            <span v-else class="label-text-alt text-base-content/50">{{ $t('agent.subagents.idHint')
                                || 'Only letters and numbers allowed, used as unique identifier' }}</span>
                        </label>
                    </div>

                    <!-- Name -->
                    <div class="form-control w-full">
                        <label class="label"><span class="label-text font-medium">{{ $t('agent.form.name') }} <span
                                    class="text-error">*</span></span></label>
                        <input v-model="formData.name" type="text" class="input input-bordered w-full"
                            :placeholder="$t('agent.subagents.namePlaceholder') || 'e.g. Researcher'" />
                    </div>

                    <!-- Description -->
                    <div class="form-control w-full">
                        <label class="label"><span class="label-text font-medium">{{ $t('agent.form.description') }}
                                <span class="text-error">*</span></span></label>
                        <input v-model="formData.description" type="text" class="input input-bordered w-full"
                            :placeholder="$t('agent.subagents.descPlaceholder') || 'Brief description of what this subagent does'" />
                    </div>

                    <!-- Model -->
                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text font-medium">Model <span
                                    class="text-base-content/50 font-normal">({{ $t('common.optional') }})</span></span>
                            <span class="label-text-alt text-base-content/50">{{ $t('agent.subagents.modelOverride') ||
                                'Overrides agent\'s default model' }}</span>
                        </label>
                        <select v-model="selectedModelValue" class="select select-bordered w-full">
                            <option value="">{{ $t('agent.form.modelPlaceholder') || 'Inherit Parent Model' }}</option>
                            <optgroup v-for="group in availableModelGroups" :key="group.provider"
                                :label="group.provider">
                                <option v-for="model in group.models" :key="model.id"
                                    :value="`${group.provider}/${model.id}`">
                                    {{ model.name }}
                                </option>
                            </optgroup>
                        </select>
                    </div>

                    <!-- System Prompt -->
                    <div class="form-control w-full">
                        <label class="label w-full"><span class="label-text font-medium">{{
                            $t('agent.subagents.systemPrompt')
                            || 'System Prompt' }} <span class="text-error">*</span></span></label>
                        <textarea v-model="formData.systemPrompt"
                            class="textarea textarea-bordered h-32 font-mono text-sm w-full"
                            :placeholder="$t('agent.subagents.promptPlaceholder') || 'You are a helpful assistant...'"></textarea>
                    </div>

                    <!-- Tools Selection -->
                    <div class="form-control w-full" v-if="formData.tools">
                        <div class="flex items-center justify-between">
                            <label class="label"><span class="label-text font-medium">{{ $t('agent.tab.tools') ||
                                'Tools' }}
                                    <span class="text-base-content/50 font-normal">({{ $t('common.optional')
                                        }})</span></span></label>
                            <button v-if="formData.tools.type === 'custom' && availableTools.length > 0" type="button"
                                class="btn btn-ghost btn-xs text-xs" @click="toggleAllTools">
                                {{ isAllToolsSelected ? ($t('common.deselectAll') || 'Deselect All') :
                                    ($t('common.selectAll') || 'Select All') }}
                            </button>
                        </div>

                        <!-- Toggle Mode -->
                        <div class="flex gap-4 mb-2">
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="radio" class="radio radio-primary radio-sm" value="inherit"
                                    v-model="formData.tools.type" />
                                <span class="label-text">{{ $t('agent.tools.inheritParent') || 'Inherit Parent'
                                    }}</span>
                            </label>
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="radio" class="radio radio-primary radio-sm" value="custom"
                                    v-model="formData.tools.type" />
                                <span class="label-text">{{ $t('agent.tools.customSelection') || 'Custom Selection'
                                    }}</span>
                            </label>
                        </div>

                        <!-- Checkboxes when custom -->
                        <div v-if="formData.tools.type === 'custom'"
                            class="bg-base-200/50 rounded-xl border border-base-200">
                            <div class="p-4 max-h-48 overflow-y-auto custom-scrollbar">
                                <div v-if="availableTools.length === 0"
                                    class="text-center text-sm text-base-content/50 py-2">
                                    {{ $t('agent.noTools') || 'No tools available in parent agent' }}
                                </div>
                                <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <label v-for="tool in availableTools" :key="tool.name"
                                        class="label cursor-pointer justify-start gap-3 bg-base-100 p-2 rounded-lg border border-base-200 hover:border-primary/30 transition-colors">
                                        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary"
                                            :checked="selectedTools.includes(tool.name)"
                                            @change="toggleToolSelection(tool.name)" />
                                        <span class="label-text text-sm font-medium truncate" :title="tool.name">{{
                                            tool.name }}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Skills Selection -->
                    <div class="form-control w-full" v-if="formData.skills">
                        <div class="flex items-center justify-between">
                            <label class="label"><span class="label-text font-medium">{{ $t('agent.tab.skills') ||
                                'Skills'
                                    }}
                                    <span class="text-base-content/50 font-normal">({{ $t('common.optional')
                                        }})</span></span></label>
                            <button v-if="formData.skills.type === 'custom' && availableSkills.length > 0" type="button"
                                class="btn btn-ghost btn-xs text-xs" @click="toggleAllSkills">
                                {{ isAllSkillsSelected ? ($t('common.deselectAll') || 'Deselect All') :
                                    ($t('common.selectAll') || 'Select All') }}
                            </button>
                        </div>

                        <!-- Toggle Mode -->
                        <div class="flex gap-4 mb-2">
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="radio" class="radio radio-primary radio-sm" value="none"
                                    v-model="formData.skills.type" />
                                <span class="label-text">{{ $t('agent.skills.disableAll') || 'Disabled' }}</span>
                            </label>
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="radio" class="radio radio-primary radio-sm" value="inherit"
                                    v-model="formData.skills.type" />
                                <span class="label-text">{{ $t('agent.skills.inheritParent') || 'Inherit Parent'
                                }}</span>
                            </label>
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="radio" class="radio radio-primary radio-sm" value="custom"
                                    v-model="formData.skills.type" />
                                <span class="label-text">{{ $t('agent.skills.customSelection') || 'Custom Selection'
                                }}</span>
                            </label>
                        </div>

                        <!-- Checkboxes when custom -->
                        <div v-if="formData.skills.type === 'custom'"
                            class="bg-base-200/50 rounded-xl border border-base-200">
                            <div class="p-4 max-h-48 overflow-y-auto custom-scrollbar">
                                <div v-if="availableSkills.length === 0"
                                    class="text-center text-sm text-base-content/50 py-2">
                                    {{ $t('agent.skills.noSkills') || 'No skills available in parent agent' }}
                                </div>
                                <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <label v-for="skill in availableSkills" :key="skill.id"
                                        class="label cursor-pointer justify-start gap-3 bg-base-100 p-2 rounded-lg border border-base-200 hover:border-primary/30 transition-colors">
                                        <input type="checkbox" class="checkbox checkbox-sm checkbox-primary"
                                            :checked="selectedSkills.includes(skill.id)"
                                            @change="toggleSkillSelection(skill.id)" />
                                        <span class="label-text text-sm font-medium truncate" :title="skill.id">{{
                                            skill.id }}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-action mt-6">
                    <button class="btn btn-ghost" @click="closeModal" :disabled="isSubmitting">{{ $t('common.cancel')
                        }}</button>
                    <button class="btn btn-primary" @click="saveSubagent" :disabled="isSubmitting">
                        <span v-if="isSubmitting" class="loading loading-spinner loading-xs"></span>
                        {{ $t('common.save') }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="closeModal">close</button>
            </form>
        </dialog>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: var(--fallback-bc, oklch(var(--bc)/0.2));
    border-radius: 3px;
}
</style>
