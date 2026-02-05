<script setup lang="ts">
import { computed, reactive, watch, ref, onMounted } from 'vue'
import { useGatewayStore } from '../../../stores/gateway'
import { useToastStore } from '../../../stores/toast'
import { updateConfigFormValue, saveConfig, type ConfigState } from '../../../services/controllers/config'
import { loadAgentFiles, loadAgentFileContent, saveAgentFile, type AgentFilesState } from '../../../services/controllers/agent-files'
import { useModels } from '../../../composables/useModels'
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
}>()

const store = useGatewayStore()
const toast = useToastStore()

// File Management
const ROLE_FILES = [
    { name: 'AGENTS.md', label: '智能体定义' },
    { name: 'SOUL.md', label: '核心人设' },
    { name: 'TOOLS.md', label: '工具配置' },
    { name: 'IDENTITY.md', label: '身份标识' },
    { name: 'USER.md', label: '用户信息' },
    { name: 'HEARTBEAT.md', label: '心跳配置' },
    { name: 'BOOTSTRAP.md', label: '引导脚本' },
    { name: 'MEMORY.md', label: '记忆存储' },
]

const fileState = reactive<AgentFilesState>({
    client: null,
    connected: false,
    agentFilesLoading: false,
    agentFilesError: null,
    agentFilesList: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileActive: null,
    agentFileSaving: false
})

const showFileModal = ref(false)
const editingFile = ref('')
const editingContent = ref('')

const editingFileLabel = computed(() => {
    return ROLE_FILES.find(f => f.name === editingFile.value)?.label || editingFile.value
})

const editingFileName = computed(() => editingFile.value)

// Sync with store
watch(() => [store.client, store.connected], ([client, connected]) => {
    fileState.client = client as any
    fileState.connected = connected as boolean
}, { immediate: true })

// Load files when agent changes
// Load files when agent changes
watch(() => props.agent.id, (newId) => {
    if (newId) {
        loadAgentFiles(fileState as unknown as AgentFilesState, newId)
    }
}, { immediate: true })

async function openFile(filename: string) {
    editingFile.value = filename
    showFileModal.value = true
    editingContent.value = '' // Clear previous content while loading
    await loadAgentFileContent(fileState as unknown as AgentFilesState, props.agent.id, filename)
    editingContent.value = fileState.agentFileContents[filename] || ''
}

function closeFileModal() {
    showFileModal.value = false
    editingFile.value = ''
    editingContent.value = ''
}

async function saveCurrentFile() {
    await saveAgentFile(fileState as unknown as AgentFilesState, props.agent.id, editingFile.value, editingContent.value)
    if (!fileState.agentFilesError) {
        toast.success('已保存')
        closeFileModal()
    } else {
        toast.error(fileState.agentFilesError)
    }
}

// Helper to find the agent in the config list
const agentIndex = computed(() => {
    const list = (store.configForm?.agents as any)?.list as any[] | undefined
    if (!list) return -1
    return list.findIndex((a: any) => a.id === props.agent.id)
})

const agentConfig = computed(() => {
    if (agentIndex.value === -1) return null
    const list = (store.configForm?.agents as any)?.list as any[]
    return list[agentIndex.value]
})

// Current model binding
const currentModel = computed({
    get: () => {
        if (agentIndex.value === -1) return ''
        const list = (store.configForm?.agents as any)?.list as any[]
        var model = list[agentIndex.value]?.model?.primary || (store.configForm?.agents as any)?.defaults?.model?.primary
        console.log('model', model)
        return model;
    },
    set: (val: string) => {
        console.log('set model', val)
        if (agentIndex.value === -1) return
        updateConfigFormValue(
            store as unknown as ConfigState,
            ['agents', 'list', agentIndex.value, 'model', 'primary'],
            val
        )
        saveConfig(store as unknown as ConfigState)
    }
})

// Available models flattened
const { availableModels } = useModels()

const isDirty = computed(() => store.configFormDirty)
const isSaving = computed(() => store.configSaving)


</script>

<template>
    <div class="space-y-6 pb-20 md:pb-6">
        <div class="space-y-2">
            <h4 class="text-sm font-medium text-base-content/60 px-2 flex items-center gap-2">
                <FingerPrintIcon class="w-4 h-4" />
                基本信息
            </h4>
            <div class="card bg-base-100 shadow-sm overflow-hidden">
                <ul class="divide-y divide-base-300">
                    <!-- <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">显示名称</span>
                        <div class="text-sm text-base-content/70 font-medium">
                            {{ agent.name }}
                        </div>
                    </li>
                    <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">智能体 ID</span>
                        <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70">
                            {{ agent.id }}
                        </div>
                    </li> -->
                    <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">工作区路径</span>
                        <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70 truncate max-w-[200px] md:max-w-md"
                            :title="agentConfig?.workspace">
                            {{ agentConfig?.workspace || '-' }}
                        </div>
                    </li>
                    <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">Agent 目录</span>
                        <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70 truncate max-w-[200px] md:max-w-md"
                            :title="agentConfig?.agentDir">
                            {{ agentConfig?.agentDir || '-' }}
                        </div>
                    </li>
                    <li class="flex items-center justify-between p-4 bg-base-100">
                        <span class="font-medium text-base-content/90">主模型</span>

                        <div v-if="agentIndex !== -1" class="flex-1 max-w-xs flex flex-col items-end gap-1">
                            <select v-model="currentModel" class="select select-bordered  w-full  ">
                                <option value="" disabled>选择模型</option>
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
                            <span>无法配置</span>
                        </div>
                    </li>
                </ul>
            </div>

            <div v-if="agentIndex === -1" class="px-2">
                <div class="text-xs text-base-content/40 flex gap-1 items-center">
                    <InformationCircleIcon class="w-3 h-3" />
                    此智能体未在配置列表中定义，无法修改模型。
                </div>
            </div>
        </div>

        <!-- Role Settings -->
        <div class="space-y-2">
            <h4 class="text-sm font-medium text-base-content/60 px-2 flex items-center gap-2">
                <DocumentTextIcon class="w-4 h-4" />
                角色设定
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
                            <div v-if="fileState.agentFilesList?.files.find(f => f.name === file.name)?.missing"
                                class="badge badge-warning badge-xs gap-1">
                                缺失
                            </div>
                            <div v-else class="badge badge-ghost badge-xs opacity-50">
                                {{(fileState.agentFilesList?.files.find(f => f.name === file.name)?.size || 0) > 0 ?
                                    (fileState.agentFilesList?.files.find(f => f.name === file.name)?.size + ' B') : '空'}}
                            </div>

                            <ChevronRightIcon class="w-4 h-4 text-base-content/30" />
                        </div>
                    </li>
                </ul>
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
                <div v-if="fileState.agentFilesLoading"
                    class="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
                    <span class="loading loading-spinner loading-lg text-primary"></span>
                </div>
                <textarea v-model="editingContent"
                    class="w-full h-full resize-none p-6 font-mono text-sm leading-relaxed focus:outline-none bg-base-100"
                    :disabled="fileState.agentFilesLoading" placeholder="输入内容..." spellcheck="false"></textarea>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-base-200 flex justify-end gap-2 bg-base-100">
                <button class="btn btn-ghost" @click="closeFileModal">取消</button>
                <button class="btn btn-primary gap-2"
                    :disabled="fileState.agentFileSaving || fileState.agentFilesLoading" @click="saveCurrentFile">
                    <span v-if="fileState.agentFileSaving" class="loading loading-spinner loading-sm"></span>
                    保存
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="closeFileModal">close</button>
        </form>
    </dialog>
</template>
