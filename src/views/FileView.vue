<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiPost } from '../composables/api-client'
import { useConfirm } from '../composables/useConfirm'
import {
    ArrowLeftIcon,
    DocumentTextIcon,
} from '@heroicons/vue/24/outline'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { confirm } = useConfirm()

const content = ref('')
const loading = ref(false)
const saving = ref(false)
const saveStatus = ref<'idle' | 'saved' | 'failed'>('idle')

/** File path from query string */
const filePath = computed(() => (route.query.path as string) || '')

/** Preview mode: content passed via router state */
const isPreview = computed(() => route.query.preview === 'true')
const previewContent = computed(() => {
    const state = history.state as any
    return state?.previewContent ?? ''
})

/** Display title */
const displayTitle = computed(() => {
    if (isPreview.value) return t('fileViewer.preview')
    if (filePath.value) {
        const parts = filePath.value.replace(/\\/g, '/').split('/')
        return parts[parts.length - 1] || filePath.value
    }
    return t('fileViewer.title')
})

async function loadFile() {
    if (!filePath.value) return
    loading.value = true
    try {
        const data = await apiPost<{ content: string }>('/api/files/open', { path: filePath.value })
        content.value = data.content
    } catch (e: any) {
        console.error('Failed to load file:', e)
        content.value = `${t('fileViewer.loadFailed')}: ${e.message || e}`
    } finally {
        loading.value = false
    }
}

async function saveFile() {
    if (!filePath.value || saving.value) return
    const confirmed = await confirm(t('fileViewer.saveConfirm'), t('fileViewer.save'))
    if (!confirmed) return
    saving.value = true
    saveStatus.value = 'idle'
    try {
        await apiPost('/api/files/save', { path: filePath.value, content: content.value })
        saveStatus.value = 'saved'
        setTimeout(() => { saveStatus.value = 'idle' }, 2000)
    } catch (e: any) {
        console.error('Failed to save file:', e)
        saveStatus.value = 'failed'
    } finally {
        saving.value = false
    }
}

function goBack() {
    if (window.history.length > 1) {
        router.back()
    } else {
        router.push({ name: 'home' })
    }
}

onMounted(() => {
    if (isPreview.value) {
        content.value = previewContent.value
    } else if (filePath.value) {
        loadFile()
    }
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-100">
        <!-- Header -->
        <div class="flex items-center gap-2 p-3 border-b border-base-300 bg-base-200/50 shrink-0">
            <button class="btn btn-sm btn-ghost btn-circle" @click="goBack">
                <ArrowLeftIcon class="w-5 h-5" />
            </button>

            <DocumentTextIcon class="w-5 h-5 text-base-content/60 shrink-0" />

            <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">{{ displayTitle }}</div>
                <div v-if="filePath && !isPreview" class="text-xs text-base-content/50 truncate font-mono">
                    {{ filePath }}
                </div>
            </div>

            <!-- Save button (file mode only) -->
            <button v-if="!isPreview && filePath" class="btn btn-sm btn-primary gap-1" :disabled="saving || loading"
                @click="saveFile">
                <span v-if="saving">{{ t('fileViewer.saving') }}</span>
                <span v-else-if="saveStatus === 'saved'" class="text-success">{{ t('fileViewer.saved') }}</span>
                <span v-else-if="saveStatus === 'failed'" class="text-error">{{ t('fileViewer.saveFailed') }}</span>
                <span v-else>{{ t('fileViewer.save') }}</span>
            </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-hidden">
            <!-- Loading -->
            <div v-if="loading" class="flex items-center justify-center h-full">
                <span class="loading loading-spinner loading-md text-primary"></span>
                <span class="ml-2 text-sm text-base-content/60">{{ t('fileViewer.loading') }}</span>
            </div>

            <!-- Editor / Viewer -->
            <textarea v-else-if="!isPreview && filePath" v-model="content"
                class="w-full h-full p-4 bg-base-100 text-sm font-mono resize-none outline-none border-none leading-relaxed"
                spellcheck="false" />

            <!-- Preview mode (read-only) -->
            <pre v-else
                class="w-full h-full p-4 text-sm font-mono whitespace-pre-wrap break-words overflow-auto leading-relaxed text-base-content/80">{{ content || t('fileViewer.noContent') }}</pre>
        </div>
    </div>
</template>
