<script setup lang="ts">
/**
 * VSCode 风格 git diff 编辑器，基于 monaco.editor.createDiffEditor。
 *
 * 设计：
 * - 拉双侧完整文本（fetchFileVersions），交给 monaco 自己计算行级 diff，体验跟 VSCode 一致。
 * - 默认 split（并排）；支持 split / inline 切换，状态持久化在 localStorage（跨 viewer 复用）。
 * - 双侧均 readOnly。需要编辑工作区文件请回到 file 模式（WorkspaceFileView）。
 * - binary：显示占位；不进入 diff editor。
 * - mode=untracked / 新增文件：原侧为空，monaco 会把整个文件标为新增，符合预期。
 * - props 变化（切换 file/ref）即重拉。
 *
 * 没有 unified-text fallback：spec 明确要求与 VSCode 风格一致。
 */
import { ref, watch, onMounted, onBeforeUnmount, useTemplateRef, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    fetchFileVersions,
    type DiffMode,
    type FileVersions,
} from '../../composables/workspace-api'
import { monaco, languageFromPath, monacoThemeFromDaisy } from './monaco-setup'

const props = defineProps<{
    agentId: string
    repo: string
    mode: DiffMode
    file: string
    refSha?: string
}>()

const { t } = useI18n()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<FileVersions | null>(null)

// split / inline 偏好持久化（跨 viewer 实例复用）
const RENDER_SIDE_BY_SIDE_KEY = 'workspace.diff.sideBySide'
function readSideBySidePref(): boolean {
    try {
        const v = localStorage.getItem(RENDER_SIDE_BY_SIDE_KEY)
        if (v === '0') return false
        if (v === '1') return true
    } catch { /* ignore */ }
    return true // default: split
}
const sideBySide = ref(readSideBySidePref())

let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: monaco.editor.ITextModel | null = null
let modifiedModel: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function ensureEditor() {
    if (diffEditor || !containerRef.value) return
    diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
        theme: monacoThemeFromDaisy(),
        readOnly: true,
        originalEditable: false,
        renderSideBySide: sideBySide.value,
        automaticLayout: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        renderLineHighlight: 'line',
        wordWrap: 'off',
        smoothScrolling: true,
        // diff 专属
        ignoreTrimWhitespace: false,
        renderOverviewRuler: true,
    })
}

function disposeEditor() {
    if (diffEditor) {
        diffEditor.dispose()
        diffEditor = null
    }
    originalModel?.dispose()
    modifiedModel?.dispose()
    originalModel = null
    modifiedModel = null
}

async function load() {
    loading.value = true
    error.value = null
    result.value = null
    const localProps = {
        agentId: props.agentId,
        repo: props.repo,
        mode: props.mode,
        file: props.file,
        refSha: props.refSha,
    }
    try {
        const r = await fetchFileVersions(props.agentId, {
            repo: props.repo,
            mode: props.mode,
            file: props.file,
            ref: props.refSha,
        })
        if (!isCurrent(localProps)) return
        result.value = r
        if (r.binary) return // 二进制：模板走占位分支，不喂 diff editor

        ensureEditor()
        if (!diffEditor) return

        const lang = languageFromPath(props.file)
        // 每次重拉销毁旧 model，避免 dispose 时机不一致引发的 disposed model 异常
        originalModel?.dispose()
        modifiedModel?.dispose()
        originalModel = monaco.editor.createModel(r.before ?? '', lang)
        modifiedModel = monaco.editor.createModel(r.after ?? '', lang)
        diffEditor.setModel({ original: originalModel, modified: modifiedModel })
    } catch (e: any) {
        if (!isCurrent(localProps)) return
        error.value = e?.message || String(e)
    } finally {
        if (isCurrent(localProps)) loading.value = false
    }
}

function isCurrent(snapshot: {
    agentId: string; repo: string; mode: DiffMode; file: string; refSha?: string
}): boolean {
    return snapshot.agentId === props.agentId
        && snapshot.repo === props.repo
        && snapshot.mode === props.mode
        && snapshot.file === props.file
        && snapshot.refSha === props.refSha
}

function toggleSideBySide() {
    sideBySide.value = !sideBySide.value
    try { localStorage.setItem(RENDER_SIDE_BY_SIDE_KEY, sideBySide.value ? '1' : '0') } catch { /* ignore */ }
    diffEditor?.updateOptions({ renderSideBySide: sideBySide.value })
}

function setupThemeObserver() {
    themeObserver = new MutationObserver(() => {
        if (diffEditor) monaco.editor.setTheme(monacoThemeFromDaisy())
    })
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    })
}

function setupResizeObserver() {
    if (!containerRef.value) return
    resizeObserver = new ResizeObserver(() => diffEditor?.layout())
    resizeObserver.observe(containerRef.value)
}

const showEmptyDiff = computed(() => {
    if (!result.value) return false
    if (result.value.binary) return false
    return (result.value.before ?? '') === (result.value.after ?? '')
})

onMounted(() => {
    ensureEditor()
    setupResizeObserver()
    setupThemeObserver()
    load()
})

watch(
    () => [props.agentId, props.repo, props.mode, props.file, props.refSha],
    () => load(),
)

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    themeObserver?.disconnect()
    disposeEditor()
})

defineExpose({ sideBySide, toggleSideBySide })
</script>

<template>
    <div class="relative h-full w-full flex flex-col">
        <!-- 顶部 banner -->
        <div v-if="result?.binary" class="bg-warning/10 text-warning text-xs px-3 py-2 border-b border-warning/30 shrink-0">
            ⚠ {{ t('workspace.binaryFile') }}
        </div>
        <div v-else-if="result?.truncated"
            class="bg-warning/10 text-warning text-xs px-3 py-2 border-b border-warning/30 shrink-0">
            ⚠ {{ t('workspace.fileTruncated') }}
        </div>

        <div class="relative flex-1 min-h-0">
            <div ref="containerRef" class="h-full w-full" :class="{ hidden: result?.binary }" />

            <div v-if="loading"
                class="absolute inset-0 flex items-center justify-center bg-base-100/60 pointer-events-none">
                <span class="loading loading-spinner loading-md text-primary" />
            </div>

            <div v-else-if="error" class="absolute inset-0 flex items-center justify-center p-4 bg-base-100">
                <div class="text-error text-sm font-mono">{{ error }}</div>
            </div>

            <div v-else-if="result?.binary"
                class="absolute inset-0 flex items-center justify-center text-base-content/60 text-sm">
                {{ t('workspace.binaryFile') }}
            </div>

            <div v-else-if="showEmptyDiff"
                class="absolute inset-0 flex items-center justify-center text-base-content/60 text-sm pointer-events-none">
                {{ t('workspace.diffNoChanges') }}
            </div>
        </div>
    </div>
</template>
