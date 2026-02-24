<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePromptState, type PromptInfo } from '../composables/usePromptState'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { useI18n } from 'vue-i18n'
import ViewHeader from '../components/ViewHeader.vue'
import PromptEditorModal from '../components/prompts/PromptEditorModal.vue'
import {
    DocumentTextIcon,
    PlusIcon,
    PencilSquareIcon,
    TrashIcon,
    LockClosedIcon,
    GlobeAltIcon,
} from '@heroicons/vue/24/outline'

const promptState = usePromptState()
const toast = useToast()
const { confirm } = useConfirm()
const { t } = useI18n()

// Editor state
const showEditor = ref(false)
const editorMode = ref<'create' | 'edit'>('create')
const editorData = ref<{ id: string; name: string; description: string; content: string } | undefined>()
const saving = ref(false)

onMounted(async () => {
    await Promise.all([
        promptState.loadSystemPrompts(),
        promptState.loadGlobalPrompts(),
    ])
})

const systemPrompts = computed(() => promptState.systemPrompts || [])
const globalPrompts = computed(() => promptState.globalPrompts || [])

// ── Editor Actions ──

const openCreateEditor = () => {
    editorMode.value = 'create'
    editorData.value = undefined
    showEditor.value = true
}

const openEditEditor = (prompt: PromptInfo) => {
    editorMode.value = 'edit'
    editorData.value = {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description || '',
        content: prompt.content,
    }
    showEditor.value = true
}

const closeEditor = () => {
    showEditor.value = false
}

const handleSave = async (data: { id: string; name: string; description: string; content: string }) => {
    saving.value = true
    try {
        await promptState.saveGlobalPrompt(data)
        toast.success(t('prompt.saveSuccess'))
        closeEditor()
    } catch (err: any) {
        toast.error(t('prompt.saveFailed', { error: err.message }))
    } finally {
        saving.value = false
    }
}

const handleDelete = async (prompt: PromptInfo) => {
    const confirmed = await confirm(t('prompt.deleteConfirm', { name: prompt.name }))
    if (!confirmed) return
    try {
        await promptState.deleteGlobalPrompt(prompt.id)
        toast.success(t('prompt.deleteSuccess'))
    } catch (err: any) {
        toast.error(t('prompt.deleteFailed', { error: err.message }))
    }
}

// Expanded state for viewing content
const expandedPromptId = ref<string | null>(null)
const toggleExpand = (id: string) => {
    expandedPromptId.value = expandedPromptId.value === id ? null : id
}
</script>

<template>
    <div class="h-full flex flex-col overflow-hidden bg-base-100">
        <ViewHeader :title="$t('prompt.title')" :is-main-page="true" />

        <div class="flex-1 overflow-y-auto p-4 space-y-8">
            <!-- Loading -->
            <div v-if="promptState.loading && !systemPrompts.length && !globalPrompts.length"
                class="flex justify-center p-8">
                <span class="loading loading-spinner loading-lg text-primary"></span>
            </div>

            <template v-else>
                <!-- ── System Prompts Section ── -->
                <section>
                    <div class="flex items-center gap-2 mb-4">
                        <LockClosedIcon class="w-5 h-5 text-warning" />
                        <h2 class="text-lg font-bold">{{ $t('prompt.system') }}</h2>
                        <span class="badge badge-warning badge-sm">{{ $t('prompt.systemReadonly') }}</span>
                    </div>

                    <div v-if="!systemPrompts.length" class="text-center py-8 text-base-content/50">
                        <DocumentTextIcon class="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p class="text-sm">{{ $t('prompt.noSystemPrompts') }}</p>
                    </div>
                    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div v-for="prompt in systemPrompts" :key="prompt.id"
                            class="card bg-base-100 border border-base-200 shadow-sm">
                            <div class="card-body p-4">
                                <div class="flex items-start justify-between mb-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <div
                                            class="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                                            <LockClosedIcon class="w-4 h-4 text-warning" />
                                        </div>
                                        <div class="min-w-0">
                                            <h3 class="font-bold text-sm truncate">{{ prompt.name }}</h3>
                                            <p class="text-xs text-base-content/50 font-mono">/ {{ prompt.id }}</p>
                                        </div>
                                    </div>
                                </div>
                                <p v-if="prompt.description" class="text-sm text-base-content/70 line-clamp-2 mb-2">
                                    {{ prompt.description }}
                                </p>
                                <div class="mt-auto pt-2 border-t border-base-200">
                                    <button class="btn btn-ghost btn-xs w-full" @click="toggleExpand(prompt.id)">
                                        {{ expandedPromptId === prompt.id ? $t('common.close') :
                                            $t('common.clickToView') }}
                                    </button>
                                    <div v-if="expandedPromptId === prompt.id"
                                        class="mt-2 p-3 bg-base-200 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                                        {{ prompt.content }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ── Global Prompts Section ── -->
                <section>
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-2">
                            <GlobeAltIcon class="w-5 h-5 text-primary" />
                            <h2 class="text-lg font-bold">{{ $t('prompt.global') }}</h2>
                        </div>
                        <button class="btn btn-sm btn-primary gap-1" @click="openCreateEditor">
                            <PlusIcon class="w-4 h-4" />
                            {{ $t('prompt.addPrompt') }}
                        </button>
                    </div>

                    <div v-if="!globalPrompts.length" class="text-center py-8 text-base-content/50">
                        <DocumentTextIcon class="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p class="text-sm">{{ $t('prompt.noGlobalPrompts') }}</p>
                    </div>
                    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div v-for="prompt in globalPrompts" :key="prompt.id"
                            class="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md transition-shadow">
                            <div class="card-body p-4">
                                <div class="flex items-start justify-between mb-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <div
                                            class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                            <GlobeAltIcon class="w-4 h-4 text-primary" />
                                        </div>
                                        <div class="min-w-0">
                                            <h3 class="font-bold text-sm truncate">{{ prompt.name }}</h3>
                                            <p class="text-xs text-base-content/50 font-mono">/ {{ prompt.id }}</p>
                                        </div>
                                    </div>
                                </div>
                                <p v-if="prompt.description" class="text-sm text-base-content/70 line-clamp-2 mb-2">
                                    {{ prompt.description }}
                                </p>
                                <div class="flex items-center gap-1 mt-auto pt-2 border-t border-base-200">
                                    <button class="btn btn-ghost btn-xs flex-1" @click="toggleExpand(prompt.id)">
                                        {{ expandedPromptId === prompt.id ? $t('common.close') :
                                            $t('common.clickToView') }}
                                    </button>
                                    <button class="btn btn-ghost btn-xs btn-square" @click="openEditEditor(prompt)">
                                        <PencilSquareIcon class="w-4 h-4" />
                                    </button>
                                    <button class="btn btn-ghost btn-xs btn-square text-error"
                                        @click="handleDelete(prompt)">
                                        <TrashIcon class="w-4 h-4" />
                                    </button>
                                </div>
                                <div v-if="expandedPromptId === prompt.id"
                                    class="mt-2 p-3 bg-base-200 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                                    {{ prompt.content }}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </template>
        </div>

        <!-- Editor Modal -->
        <PromptEditorModal :show="showEditor" :mode="editorMode" :prompt-data="editorData" :saving="saving"
            @close="closeEditor" @save="handleSave" />
    </div>
</template>
