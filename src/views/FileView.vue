<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiPost } from '../composables/api-client'
import { useConfirm } from '../composables/useConfirm'
import hljs from '../utils/markdown/hljs'
import {
    ArrowLeftIcon,
    DocumentTextIcon,
    ClipboardDocumentIcon,
    CheckIcon,
    PencilSquareIcon,
    EyeIcon,
} from '@heroicons/vue/24/outline'

const props = defineProps<{
    path?: string
    preview?: boolean
    previewContent?: string
    isModal?: boolean
}>()

const emit = defineEmits(['close'])

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { confirm } = useConfirm()

const content = ref('')
const loading = ref(false)
const saving = ref(false)
const saveStatus = ref<'idle' | 'saved' | 'failed'>('idle')
const copied = ref(false)
const isEditing = ref(false)

/** File path from props or query string */
const filePath = computed(() => props.path || (route.query.path as string) || '')

/** Preview mode: from props or router state */
const isPreview = computed(() => props.preview || route.query.preview === 'true')
const resolvedPreviewContent = computed(() => {
    if (props.preview && props.previewContent !== undefined) return props.previewContent
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

/** Extract file extension for language detection */
const fileLanguage = computed(() => {
    const name = displayTitle.value
    const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''
    const extMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        vue: 'vue',
        py: 'python',
        rs: 'rust',
        go: 'go',
        java: 'java',
        kt: 'kotlin',
        swift: 'swift',
        rb: 'ruby',
        php: 'php',
        cs: 'csharp',
        cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
        c: 'c', h: 'c',
        css: 'css', scss: 'scss', sass: 'scss', less: 'less',
        html: 'html', htm: 'html',
        xml: 'xml', svg: 'xml',
        json: 'json',
        yaml: 'yaml', yml: 'yaml',
        toml: 'toml',
        md: 'markdown',
        sql: 'sql',
        sh: 'bash', bash: 'bash', zsh: 'bash',
        ps1: 'powershell',
        dockerfile: 'dockerfile',
        makefile: 'makefile',
        r: 'r',
        dart: 'dart',
        lua: 'lua',
        perl: 'perl',
        ini: 'ini',
        conf: 'ini',
    }
    if (ext && extMap[ext]) return extMap[ext]
    if (ext) return ext
    // 无扩展名时，根据内容开头猜测语言
    return guessLanguageFromContent(content.value)
})

/** 根据内容特征猜测语言 */
function guessLanguageFromContent(text: string): string {
    if (!text) return 'plaintext'
    const trimmed = text.trimStart()
    const head = trimmed.slice(0, 500).toLowerCase()
    const firstLine = trimmed.split('\n')[0].trim()

    // HTML / XML
    if (/^<!doctype\s+html/i.test(firstLine) || /^<html[\s>]/i.test(firstLine)) return 'html'
    if (/^<\?xml\s/i.test(firstLine)) return 'xml'
    // Vue SFC
    if (/^<(template|script|style)[\s>]/i.test(firstLine)) return 'vue'
    // JSON
    if (/^\s*[{\[]/.test(firstLine)) {
        try { JSON.parse(trimmed); return 'json' } catch { /* not valid json */ }
    }
    // Shebang
    if (firstLine.startsWith('#!')) {
        if (/\b(bash|sh|zsh)\b/.test(firstLine)) return 'bash'
        if (/\bpython/.test(firstLine)) return 'python'
        if (/\bnode\b/.test(firstLine)) return 'javascript'
        if (/\bruby\b/.test(firstLine)) return 'ruby'
        if (/\bperl\b/.test(firstLine)) return 'perl'
        return 'bash'
    }
    // Markdown: 开头是 # 标题 或 --- front matter
    if (/^#{1,6}\s/.test(firstLine)) return 'markdown'
    if (firstLine === '---' && head.includes('\n---')) return 'markdown'
    // YAML
    if (firstLine === '---' || /^\w[\w-]*:\s/.test(firstLine)) return 'yaml'
    // SQL
    if (/^(select|insert|update|delete|create|alter|drop|with)\s/i.test(firstLine)) return 'sql'
    // CSS
    if (/^(@import|@charset|@media|@keyframes|\*|body|html|:root)\s*\{?/.test(firstLine)) return 'css'
    // Python: import / from / def / class
    if (/^(import |from \w+ import |def |class )/.test(firstLine)) return 'python'
    // Rust: use / fn / pub / mod / struct / impl
    if (/^(use |fn |pub |mod |struct |impl |extern )/.test(firstLine)) return 'rust'
    // Go: package
    if (/^package\s+\w+/.test(firstLine)) return 'go'
    // Java/Kotlin: package
    if (/^(package|import)\s+[\w.]+;?/.test(firstLine) && head.includes('class ')) return 'java'
    // TypeScript/JavaScript: import/export/const/let/var/function
    if (/^(import |export |const |let |var |function |\/\/ )/.test(firstLine)) return 'javascript'
    // PHP
    if (firstLine.startsWith('<?php')) return 'php'
    // INI / TOML
    if (/^\[[\w.\-]+\]/.test(firstLine)) return 'ini'
    // Dockerfile
    if (/^FROM\s+\w/i.test(firstLine)) return 'dockerfile'

    return 'plaintext'
}

/** Highlighted HTML */
const highlightedHtml = computed(() => {
    if (!content.value) return ''
    try {
        return hljs.highlight(content.value, { language: fileLanguage.value }).value
    } catch {
        try {
            return hljs.highlightAuto(content.value).value
        } catch {
            return content.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        }
    }
})

/** Line count */
const lineCount = computed(() => {
    if (!content.value) return 1
    return content.value.split('\n').length
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const lineNumberRef = ref<HTMLDivElement | null>(null)

function syncScroll() {
    if (textareaRef.value && lineNumberRef.value) {
        lineNumberRef.value.scrollTop = textareaRef.value.scrollTop
    }
}

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

async function copyContent() {
    try {
        await navigator.clipboard.writeText(content.value)
        copied.value = true
        setTimeout(() => { copied.value = false }, 2000)
    } catch (e) {
        console.error('Failed to copy:', e)
    }
}

function toggleEdit() {
    isEditing.value = !isEditing.value
}

function goBack() {
    if (props.isModal) {
        emit('close')
        return
    }
    if (window.history.length > 1) {
        router.back()
    } else {
        router.push({ name: 'home' })
    }
}

onMounted(() => {
    if (isPreview.value) {
        content.value = resolvedPreviewContent.value
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

            <!-- Copy button -->
            <button class="btn btn-sm btn-ghost gap-1" :disabled="loading || !content" @click="copyContent"
                :title="copied ? t('common.copied') : t('common.copy')">
                <CheckIcon v-if="copied" class="w-4 h-4 text-success" />
                <ClipboardDocumentIcon v-else class="w-4 h-4" />
            </button>

            <!-- Edit/View toggle (file mode only) -->
            <button v-if="!isPreview && filePath" class="btn btn-sm btn-ghost gap-1" :disabled="loading"
                @click="toggleEdit">
                <EyeIcon v-if="isEditing" class="w-4 h-4" />
                <PencilSquareIcon v-else class="w-4 h-4" />
            </button>

            <!-- Save button (file mode, editing only) -->
            <button v-if="!isPreview && filePath && isEditing" class="btn btn-sm btn-primary gap-1"
                :disabled="saving || loading" @click="saveFile">
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

            <!-- Editor mode (editable textarea with line numbers) -->
            <div v-else-if="isEditing && !isPreview && filePath" class="flex h-full fv-container">
                <div ref="lineNumberRef"
                    class="fv-line-numbers shrink-0 bg-base-200/60 text-base-content/30 text-right select-none overflow-hidden border-r border-base-300">
                    <div v-for="n in lineCount" :key="n" class="fv-line-number">{{ n }}</div>
                </div>
                <textarea ref="textareaRef" v-model="content"
                    class="flex-1 bg-base-100 text-sm font-mono resize-none outline-none border-none leading-[1.625rem] p-2 overflow-auto"
                    spellcheck="false" @scroll="syncScroll" />
            </div>

            <!-- Highlighted code view (default for both file mode & preview mode) -->
            <div v-else-if="content" class="flex h-full overflow-auto fv-container">
                <div
                    class="fv-line-numbers shrink-0 bg-base-200/60 text-base-content/30 text-right select-none sticky left-0 border-r border-base-300">
                    <div v-for="n in lineCount" :key="n" class="fv-line-number">{{ n }}</div>
                </div>
                <pre
                    class="fv-code flex-1 p-2 m-0 text-sm font-mono leading-[1.625rem]"><code class="hljs" v-html="highlightedHtml"></code></pre>
            </div>

            <!-- No content fallback -->
            <div v-else-if="!loading"
                class="flex items-center justify-center w-full h-full text-base-content/50 text-sm">
                {{ t('fileViewer.noContent') }}
            </div>
        </div>
    </div>
</template>

<style>
/* NOT scoped — hljs v-html generated spans need global styles */
.fv-container {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}

.fv-line-numbers {
    padding: 0.5rem 0;
    min-width: 3rem;
    font-size: 0.75rem;
    line-height: 1.625rem;
    font-family: inherit;
}

.fv-line-number {
    padding: 0 0.5rem;
    height: 1.625rem;
    line-height: 1.625rem;
}

.fv-code {
    background: transparent !important;
    white-space: pre;
}

.fv-code code {
    background: transparent !important;
}

/* ── hljs token colors (light) ── */
[data-theme="light"] .fv-code .hljs {
    color: #24292e;
}

[data-theme="light"] .fv-code .hljs-doctag,
[data-theme="light"] .fv-code .hljs-keyword,
[data-theme="light"] .fv-code .hljs-meta .hljs-keyword,
[data-theme="light"] .fv-code .hljs-template-tag,
[data-theme="light"] .fv-code .hljs-template-variable,
[data-theme="light"] .fv-code .hljs-type,
[data-theme="light"] .fv-code .hljs-variable.language_ {
    color: #d73a49;
}

[data-theme="light"] .fv-code .hljs-title,
[data-theme="light"] .fv-code .hljs-title.class_,
[data-theme="light"] .fv-code .hljs-title.class_.inherited__,
[data-theme="light"] .fv-code .hljs-title.function_ {
    color: #6f42c1;
}

[data-theme="light"] .fv-code .hljs-attr,
[data-theme="light"] .fv-code .hljs-attribute,
[data-theme="light"] .fv-code .hljs-literal,
[data-theme="light"] .fv-code .hljs-meta,
[data-theme="light"] .fv-code .hljs-number,
[data-theme="light"] .fv-code .hljs-operator,
[data-theme="light"] .fv-code .hljs-variable,
[data-theme="light"] .fv-code .hljs-selector-attr,
[data-theme="light"] .fv-code .hljs-selector-class,
[data-theme="light"] .fv-code .hljs-selector-id {
    color: #005cc5;
}

[data-theme="light"] .fv-code .hljs-regexp,
[data-theme="light"] .fv-code .hljs-string,
[data-theme="light"] .fv-code .hljs-meta .hljs-string {
    color: #032f62;
}

[data-theme="light"] .fv-code .hljs-built_in,
[data-theme="light"] .fv-code .hljs-symbol {
    color: #e36209;
}

[data-theme="light"] .fv-code .hljs-comment,
[data-theme="light"] .fv-code .hljs-code,
[data-theme="light"] .fv-code .hljs-formula {
    color: #6a737d;
}

[data-theme="light"] .fv-code .hljs-name,
[data-theme="light"] .fv-code .hljs-quote,
[data-theme="light"] .fv-code .hljs-selector-tag,
[data-theme="light"] .fv-code .hljs-selector-pseudo {
    color: #22863a;
}

[data-theme="light"] .fv-code .hljs-subst {
    color: #24292e;
}

[data-theme="light"] .fv-code .hljs-section {
    color: #005cc5;
    font-weight: bold;
}

[data-theme="light"] .fv-code .hljs-bullet {
    color: #735c0f;
}

[data-theme="light"] .fv-code .hljs-addition {
    color: #22863a;
    background-color: #f0fff4;
}

[data-theme="light"] .fv-code .hljs-deletion {
    color: #b31d28;
    background-color: #ffeef0;
}

/* ── hljs token colors (dark) ── */
[data-theme="dark"] .fv-code .hljs {
    color: #c9d1d9;
}

[data-theme="dark"] .fv-code .hljs-doctag,
[data-theme="dark"] .fv-code .hljs-keyword,
[data-theme="dark"] .fv-code .hljs-meta .hljs-keyword,
[data-theme="dark"] .fv-code .hljs-template-tag,
[data-theme="dark"] .fv-code .hljs-template-variable,
[data-theme="dark"] .fv-code .hljs-type,
[data-theme="dark"] .fv-code .hljs-variable.language_ {
    color: #ff7b72;
}

[data-theme="dark"] .fv-code .hljs-title,
[data-theme="dark"] .fv-code .hljs-title.class_,
[data-theme="dark"] .fv-code .hljs-title.class_.inherited__,
[data-theme="dark"] .fv-code .hljs-title.function_ {
    color: #d2a8ff;
}

[data-theme="dark"] .fv-code .hljs-attr,
[data-theme="dark"] .fv-code .hljs-attribute,
[data-theme="dark"] .fv-code .hljs-literal,
[data-theme="dark"] .fv-code .hljs-meta,
[data-theme="dark"] .fv-code .hljs-number,
[data-theme="dark"] .fv-code .hljs-operator,
[data-theme="dark"] .fv-code .hljs-variable,
[data-theme="dark"] .fv-code .hljs-selector-attr,
[data-theme="dark"] .fv-code .hljs-selector-class,
[data-theme="dark"] .fv-code .hljs-selector-id {
    color: #79c0ff;
}

[data-theme="dark"] .fv-code .hljs-regexp,
[data-theme="dark"] .fv-code .hljs-string,
[data-theme="dark"] .fv-code .hljs-meta .hljs-string {
    color: #a5d6ff;
}

[data-theme="dark"] .fv-code .hljs-built_in,
[data-theme="dark"] .fv-code .hljs-symbol {
    color: #ffa657;
}

[data-theme="dark"] .fv-code .hljs-comment,
[data-theme="dark"] .fv-code .hljs-code,
[data-theme="dark"] .fv-code .hljs-formula {
    color: #8b949e;
}

[data-theme="dark"] .fv-code .hljs-name,
[data-theme="dark"] .fv-code .hljs-quote,
[data-theme="dark"] .fv-code .hljs-selector-tag,
[data-theme="dark"] .fv-code .hljs-selector-pseudo {
    color: #7ee787;
}

[data-theme="dark"] .fv-code .hljs-subst {
    color: #c9d1d9;
}

[data-theme="dark"] .fv-code .hljs-section {
    color: #1f6feb;
    font-weight: bold;
}

[data-theme="dark"] .fv-code .hljs-bullet {
    color: #f2cc60;
}

[data-theme="dark"] .fv-code .hljs-addition {
    color: #aff5b4;
    background-color: #033a16;
}

[data-theme="dark"] .fv-code .hljs-deletion {
    color: #ffdcd7;
    background-color: #67060c;
}
</style>
