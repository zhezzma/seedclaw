<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from '../../../composables/useToast'
import { AgentInfo, useAgentsState, AgentFileInfo } from '../../../composables/useAgentsState'
import { useI18n } from 'vue-i18n'
import {
    DocumentTextIcon,
    ChevronRightIcon
} from '@heroicons/vue/24/outline'

// Props
const props = defineProps<{
    agent: AgentInfo
}>()

const toast = useToast()
const agentsState = useAgentsState()
const { t } = useI18n()

// File Management
const FILE_GROUPS = computed(() => [
    {
        title: t('agent.roleSettings'),
        files: [
            { name: 'AGENTS.md', label: t('agent.files.agent') },
            { name: 'SYSTEM.md', label: t('agent.files.system') },
            { name: 'IDENTITY.md', label: t('agent.files.identity') },
            { name: 'USER.md', label: t('agent.files.user') },
        ]
    },
    {
        title: t('agent.capabilitySettings'),
        files: [
            { name: 'TOOLS.md', label: t('agent.files.tools') },
            { name: 'HEARTBEAT.md', label: t('agent.files.heartbeat') },
            { name: 'BOOTSTRAP.md', label: t('agent.files.bootstrap') },
        ]
    },
    {
        title: t('agent.memorySettings'),
        files: [
            { name: 'MEMORY.md', label: t('agent.files.memory') },
            { name: 'MEMORY_TODAY.md', label: t('agent.files.memoryToday') },
            { name: 'MEMORY_YESTERDAY.md', label: t('agent.files.memoryYesterday') },
        ]
    }
])

const showFileModal = ref(false)
const editingFile = ref('')
const editingContent = ref('')

const editingFileLabel = computed(() => {
    for (const group of FILE_GROUPS.value) {
        const file = group.files.find(f => f.name === editingFile.value)
        if (file) return file.label
    }
    return editingFile.value
})

const editingFileName = computed(() => editingFile.value)

// File Management
const agentFilesList = ref<AgentFileInfo[]>([])

// Load files when agent changes
watch(() => props.agent.id, async (newId) => {
    agentFilesList.value = await agentsState.loadAgentFiles(newId) || []
}, { immediate: true })

async function openFile(filename: string) {
    editingFile.value = filename
    showFileModal.value = true
    editingContent.value = '' // Clear previous content while loading
    await agentsState.loadAgentFileContent(props.agent.id, filename)
    editingContent.value = agentsState.agentFiles[`${props.agent.id}:${filename}`]?.content || ''
}

function closeFileModal() {
    showFileModal.value = false
    editingFile.value = ''
    editingContent.value = ''
}

async function saveCurrentFile() {
    try {
        await agentsState.saveAgentFile(props.agent.id, editingFile.value, editingContent.value)
        toast.success(t('common.savedSuccess'))
        closeFileModal()
    } catch (err: any) {
        toast.error(err.message || String(err))
    }
}
</script>

<template>
    <div>
        <div class="space-y-6 pb-20 md:pb-6">
            <!-- Settings Groups -->
            <div v-for="group in FILE_GROUPS" :key="group.title" class="space-y-2">
                <h4 class="text-sm font-medium text-base-content/60 px-2 flex items-center gap-2">
                    <DocumentTextIcon class="w-4 h-4" />
                    {{ group.title }}
                </h4>
                <div class="card bg-base-100 shadow-sm overflow-hidden">
                    <ul class="divide-y divide-base-300">
                        <li v-for="file in group.files" :key="file.name"
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
                                <div v-if="agentFilesList?.find((f: any) => f.name === file.name)?.missing"
                                    class="badge badge-warning badge-xs gap-1">
                                    {{ $t('agent.missing') }}
                                </div>
                                <div v-else class="badge badge-ghost badge-xs opacity-50">
                                    {{(agentFilesList?.find((f: any) => f.name === file.name)?.size || 0) >
                                        0
                                        ? (agentFilesList?.find((f: any) => f.name === file.name)?.size +
                                            ' B')
                                        : $t('agent.empty')}}
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
                    <textarea v-model="editingContent"
                        class="w-full h-full resize-none p-6 font-mono text-sm leading-relaxed focus:outline-none bg-base-100"
                        placeholder="输入内容..." spellcheck="false"></textarea>
                </div>

                <!-- Footer -->
                <div class="px-6 py-4 border-t border-base-200 flex justify-end gap-2 bg-base-100">
                    <button class="btn btn-ghost" @click="closeFileModal">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary gap-2" @click="saveCurrentFile">
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
