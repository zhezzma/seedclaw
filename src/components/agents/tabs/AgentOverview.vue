<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted } from 'vue'
import { useGateway } from '../../../composables/useGateway'
import { useToast } from '../../../composables/useToast'
import { type AgentFilesState } from '~openclaw/ui/src/ui/controllers/agent-files'
import { useModels } from '../../../composables/useModels'
import { useAgentsState } from '../../../composables/useAgentsState'
import { useConfigState } from '../../../composables/useConfigState'
import { useI18n } from 'vue-i18n'
import {
    FingerPrintIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    CloudArrowUpIcon,
    DocumentTextIcon,
    ChevronRightIcon
} from '@heroicons/vue/24/outline'

// Props
const props = defineProps<{
    agent: any
    configState?: any
}>()

const store = useGateway()
const toast = useToast()
const agentsState = useAgentsState()
const configStore = useConfigState()
const { t } = useI18n()

// File Management
// File Management
const ROLE_FILES = computed(() => [
    { name: 'AGENTS.md', label: t('agent.files.agent') },
    { name: 'SOUL.md', label: t('agent.files.soul') },
    { name: 'TOOLS.md', label: t('agent.files.tools') },
    { name: 'IDENTITY.md', label: t('agent.files.identity') },
    { name: 'USER.md', label: t('agent.files.user') },
    { name: 'HEARTBEAT.md', label: t('agent.files.heartbeat') },
    { name: 'BOOTSTRAP.md', label: t('agent.files.bootstrap') },
    { name: 'MEMORY.md', label: t('agent.files.memory') },
])

const showFileModal = ref(false)
const editingFile = ref('')
const editingContent = ref('')

const editingFileLabel = computed(() => {
    return ROLE_FILES.value.find(f => f.name === editingFile.value)?.label || editingFile.value
})

const editingFileName = computed(() => editingFile.value)

// Load files when agent changes
// Load files when agent changes
watch(() => props.agent.id, (newId) => {
    if (newId) {
        agentsState.loadAgentFiles(newId)
    }
}, { immediate: true })

async function openFile(filename: string) {
    editingFile.value = filename
    showFileModal.value = true
    editingContent.value = '' // Clear previous content while loading
    console.log('openFile', filename, props.agent.id)
    await agentsState.loadAgentFileContent(props.agent.id, filename, { force: true })
    editingContent.value = agentsState.agentFileContents[filename] || ''
}

function closeFileModal() {
    showFileModal.value = false
    editingFile.value = ''
    editingContent.value = ''
}

async function saveCurrentFile() {
    await agentsState.saveAgentFile(props.agent.id, editingFile.value, editingContent.value)
    if (!agentsState.agentFilesError) {
        toast.success(t('common.savedSuccess'))
        closeFileModal()
    } else {
        toast.error(agentsState.agentFilesError)
    }
}

// Helper to find the agent in the config list
const agentIndex = computed(() => {
    const list = (props.configState?.configForm?.agents as any)?.list as any[] | undefined
    if (!list) return -1
    return list.findIndex((a: any) => a.id === props.agent.id)
})

const agentConfig = computed(() => {
    if (agentIndex.value === -1) return null
    const list = (props.configState?.configForm?.agents as any)?.list as any[]
    return list[agentIndex.value]
})

// Current model binding
const currentModel = computed({
    get: () => {
        if (agentIndex.value === -1) return ''
        const list = (props.configState?.configForm?.agents as any)?.list as any[]
        var model = list[agentIndex.value]?.model?.primary || (props.configState?.configForm?.agents as any)?.defaults?.model?.primary
        console.log('model', model)
        return model;
    },
    set: async (val: string) => {
        console.log('set model', val)
        if (agentIndex.value === -1 || !props.configState) return
        configStore.updateConfigFormValue(
            ['agents', 'list', `${agentIndex.value}`, 'model', 'primary'],
            val
        )
        await configStore.saveConfig()
    }
})

// Available models flattened
const { availableModels } = useModels()

const isCurrentModelAvailable = computed(() => {
    const modelId = currentModel.value
    if (!modelId) return true
    for (const group of availableModels.value) {
        if (group.models.some((m: any) => m.id === modelId)) return true
    }
    return false
})

const isDirty = computed(() => props.configState?.configFormDirty)
const isSaving = computed(() => props.configState?.configSaving)

// Delete Agent Logic
import { useRouter } from 'vue-router'
import { useExecApproval } from '../../../composables/useExecApproval'
import { useConfirm } from '../../../composables/useConfirm'

const router = useRouter()
const execApproval = useExecApproval()
const { confirm } = useConfirm()
const isDeleting = ref(false)

const handleDeleteAgent = async () => {
    if (!await confirm(t('agent.deleteConfirm', { name: props.agent.name }))) {
        return
    }

    isDeleting.value = true
    try {
        const agentId = props.agent.id
        await agentsState.deleteAgent({ agentId, deleteFiles: true })
        toast.success(t('agent.deleteSuccess'))

        // 4. Redirect
        router.replace({ name: 'agents' })

    } catch (err: any) {
        console.error('Failed to delete agent:', err)
        toast.error(t('agent.deleteFailed', { error: String(err.message || err) }))
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <div>
        <div class="space-y-6 pb-20 md:pb-6">
            <div class="space-y-2">
                <h4 class="text-sm font-medium text-base-content/60 px-2 flex items-center gap-2">
                    <FingerPrintIcon class="w-4 h-4" />
                    {{ $t('agent.basicInfo') }}
                </h4>
                <div class="card bg-base-100 shadow-sm overflow-hidden">
                    <ul class="divide-y divide-base-300">
                        <!-- <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">{{ $t('agent.displayName') }}</span>
                        <div class="text-sm text-base-content/70 font-medium">
                            {{ agent.name }}
                        </div>
                    </li>
                    <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">{{ $t('agent.agentId') }}</span>
                        <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70">
                            {{ agent.id }}
                        </div>
                    </li> -->
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.workspace') }}</span>
                            <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70 truncate max-w-[200px] md:max-w-md"
                                :title="agentConfig?.workspace">
                                {{ agentConfig?.workspace || '-' }}
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.agentDir') }}</span>
                            <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70 truncate max-w-[200px] md:max-w-md"
                                :title="agentConfig?.agentDir">
                                {{ agentConfig?.agentDir || '-' }}
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.mainModel') }}</span>

                            <div v-if="agentIndex !== -1" class="flex-1 max-w-[250px] flex flex-col items-end gap-1">
                                <select v-model="currentModel" class="select select-bordered  w-full  ">
                                    <option value="" disabled>{{ $t('agent.selectModel') }}</option>
                                    <option v-if="!isCurrentModelAvailable && currentModel" :value="currentModel">
                                        {{ currentModel }} ({{ $t('agent.unknownModel') }})
                                    </option>
                                    <optgroup v-for="group in availableModels" :key="group.provider"
                                        :label="group.provider">
                                        <option v-for="model in group.models" :key="model.id" :value="model.id"
                                            class="w-100 truncate block">
                                            {{ model.name }} ({{ model.id }})
                                        </option>
                                    </optgroup>
                                </select>
                            </div>
                            <div v-else class="text-sm text-warning flex items-center gap-1">
                                <ExclamationTriangleIcon class="w-4 h-4" />
                                <span>{{ $t('agent.cannotConfig') }}</span>
                            </div>
                        </li>
                    </ul>
                </div>

                <div v-if="agentIndex === -1" class="px-2">
                    <div class="text-xs text-base-content/40 flex gap-1 items-center">
                        <InformationCircleIcon class="w-3 h-3" />
                        {{ $t('agent.configNotInList') }}
                    </div>
                </div>
            </div>

            <!-- Role Settings -->
            <div class="space-y-2">
                <h4 class="text-sm font-medium text-base-content/60 px-2 flex items-center gap-2">
                    <DocumentTextIcon class="w-4 h-4" />
                    {{ $t('agent.roleSettings') }}
                </h4>
                <div class="card bg-base-100 shadow-sm overflow-hidden">
                    <ul class="divide-y divide-base-300">
                        <li v-for="file in ROLE_FILES" :key="file.name"
                            class="flex items-center justify-between p-4 bg-base-100 hover:bg-base-200/50 transition-colors cursor-pointer"
                            @click="openFile(file.name)">
                            <div class="flex items-center gap-3">
                                <DocumentTextIcon class="w-5 h-5 text-base-content/40" />
                                <div>
                                    <div class="font-medium text-base-content/90">{{ file.label }}</div>
                                    <div class="text-xs text-base-content/50 font-mono mt-0.5">{{ file.name }}</div>
                                </div>
                            </div>

                            <div class="flex items-center gap-3">
                                <!-- Status Badge -->
                                <div v-if="agentsState.agentFilesList?.files.find(f => f.name === file.name)?.missing"
                                    class="badge badge-warning badge-xs gap-1">
                                    {{ $t('agent.missing') }}
                                </div>
                                <div v-else class="badge badge-ghost badge-xs opacity-50">
                                    {{(agentsState.agentFilesList?.files.find(f => f.name === file.name)?.size || 0) > 0
                                        ?
                                        (agentsState.agentFilesList?.files.find(f => f.name === file.name)?.size + ' B') :
                                        $t('agent.empty')}}
                                </div>

                                <ChevronRightIcon class="w-4 h-4 text-base-content/30" />
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Danger Zone -->
            <div class="space-y-2 pt-6 border-t border-base-200/50">
                <h4 class="text-sm font-medium text-error/80 px-2 flex items-center gap-2">
                    <ExclamationTriangleIcon class="w-4 h-4" />
                    {{ $t('agent.dangerZone') }}
                </h4>
                <div class="card bg-base-100 border border-error/20 shadow-sm overflow-hidden">
                    <div class="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <h3 class="font-medium text-base-content">{{ $t('agent.deleteAgent') }}</h3>
                            <p class="text-sm text-base-content/60 mt-1">
                                {{ $t('agent.deleteAgentDesc') }}
                            </p>
                        </div>
                        <button class="btn btn-error btn-outline md:btn-wide" @click="handleDeleteAgent"
                            :disabled="isDeleting">
                            <span v-if="isDeleting" class="loading loading-spinner loading-sm"></span>
                            {{ isDeleting ? $t('agent.deleting') : $t('agent.deleteAgent') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- File Edit Modal -->
        <dialog class="modal" :class="{ 'modal-open': showFileModal }">
            <div class="modal-box w-11/12 max-w-5xl h-[80vh] flex flex-col p-0 bg-base-100">
                <!-- Header -->
                <div class="flex items-center justify-between px-6 py-4 border-b border-base-200">
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-lg">{{ editingFileLabel }}</h3>
                        <span class="text-xs font-mono opacity-50">{{ editingFileName }}</span>
                    </div>
                    <button class="btn btn-ghost btn-sm btn-circle" @click="closeFileModal">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-hidden relative">
                    <div v-if="agentsState.agentFilesLoading"
                        class="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
                        <span class="loading loading-spinner loading-lg text-primary"></span>
                    </div>
                    <textarea v-model="editingContent"
                        class="w-full h-full resize-none p-6 font-mono text-sm leading-relaxed focus:outline-none bg-base-100"
                        :disabled="agentsState.agentFilesLoading" placeholder="输入内容..." spellcheck="false"></textarea>
                </div>

                <!-- Footer -->
                <div class="px-6 py-4 border-t border-base-200 flex justify-end gap-2 bg-base-100">
                    <button class="btn btn-ghost" @click="closeFileModal">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary gap-2"
                        :disabled="agentsState.agentFileSaving || agentsState.agentFilesLoading"
                        @click="saveCurrentFile">
                        <span v-if="agentsState.agentFileSaving" class="loading loading-spinner loading-sm"></span>
                        {{ $t('common.save') }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="closeFileModal">close</button>
            </form>
        </dialog>
    </div>
</template>
