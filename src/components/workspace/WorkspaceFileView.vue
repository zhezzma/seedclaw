<script setup lang="ts">
/**
 * Workspace 专用文件编辑器，基于 monaco-editor。
 *
 * 设计原则（VSCode 体验）：
 * - 打开即可直接编辑，无 view/edit 模式切换
 * - Ctrl/Cmd+S 保存；父组件头部也提供 Save 按钮
 * - dirty 追踪：内容 vs baseline 比对，关闭/切换文件前由父组件 confirm
 * - 二进制 / 截断的文件强制 readOnly（编辑后保存会写入损坏 / 截断数据 → 安全约束，不是 UX 选项）
 * - 图片文件走 /workspace/raw 拿 blob 后用 <img> 渲染，不走 monaco
 * - HTML 预览（previewMode）用 iframe srcdoc 盖在编辑器之上，内容跟 dirty buffer
 * - Markdown 预览（previewMode）复用 chat 的 MarkdownRenderer，与其共享同一个
 *   agent-output 信任边界：markdown-it 默认 html=false 转义裸 HTML / 禁 javascript: scheme，
 *   但 mermaid securityLevel:'loose'、v-html 渲染到主文档是已知风险点（跟 chat 等价）；
 *   相对路径图片不支持（显示破图）
 *
 * defineExpose 给父组件用：
 *   isDirty / isSaving / isBinary / isTruncated / isReadOnly / isImage
 *   previewMode / togglePreview / content / save
 */
import { ref, watch, onMounted, onBeforeUnmount, useTemplateRef, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    fetchFile, saveFile,
    fetchAgentFile, saveAgentFile,
    fetchRawFile, isImagePath, previewableExt,
} from '../../composables/workspace-api'
import { useToast } from '../../composables/useToast'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'
import { monaco, languageFromPath, monacoThemeFromDaisy } from './monaco-setup'
import MarkdownRenderer from '../chat/MarkdownRenderer.vue'

const props = defineProps<{
    agentId: string
    /** workspace 相对路径 (scope=workspace) 或 agentDir 相对路径 (scope=agent) */
    path: string
    /** 默认 workspace；走 /file。agent 走 /agent-file，对应 paths.agentDir(id) 下的配置文件。 */
    scope?: 'workspace' | 'agent'
}>()

const scope = computed(() => props.scope ?? 'workspace')
const fetchByScope = (id: string, p: string) =>
    scope.value === 'agent' ? fetchAgentFile(id, p) : fetchFile(id, p)
const saveByScope = (id: string, p: string, content: string) =>
    scope.value === 'agent' ? saveAgentFile(id, p, content) : saveFile(id, p, content)

const { t } = useI18n()
const toast = useToast()
const viewer = useWorkspaceViewer()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const loading = ref(false)
const error = ref<string | null>(null)

// 暴露给父组件的状态
const isSaving = ref(false)
const isBinary = ref(false)
const isTruncated = ref(false)
/** 图片预览：workspace scope + 图片扩展名 → 走 raw 获取 blob URL 渲染 <img>。 */
const isImage = ref(false)
const imageObjectUrl = ref<string | null>(null)
/** 预览模式（HTML）—— true 时用 iframe 渲染当前 buffer，替换编辑器。
 *  父组件通过 togglePreview() / setPreviewMode(false) 控制。 */
const previewMode = ref(false)
/** 当前 model 的内容（响应式跟随 monaco onDidChangeModelContent 同步） */
const content = ref('')
/** 上一次 load/save 后的原始内容；用于 dirty 比对 */
const baselineContent = ref('')
const isDirty = computed(() => content.value !== baselineContent.value)
/** 只读条件：二进制 / 截断 / load 失败 / 图片 */
const isReadOnly = computed(() => isBinary.value || isTruncated.value || isImage.value || error.value !== null)

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let modelChangeDisposer: monaco.IDisposable | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function ensureEditor() {
    if (editor || !containerRef.value) return
    editor = monaco.editor.create(containerRef.value, {
        value: '',
        language: 'plaintext',
        theme: monacoThemeFromDaisy(),
        readOnly: false, // 默认就能编辑（VSCode 风格）
        automaticLayout: false, // 自己用 ResizeObserver 控制（automaticLayout 在隐藏容器中会跳）
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        wordWrap: 'off',
        smoothScrolling: true,
    })
    // Ctrl/Cmd+S → save。Monaco 默认会把 Ctrl+S 给 cmd palette 用，addCommand 直接覆盖。
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        save()
    })
}

function disposeEditor() {
    modelChangeDisposer?.dispose()
    modelChangeDisposer = null
    if (editor) {
        const model = editor.getModel()
        editor.dispose()
        model?.dispose()
        editor = null
    }
}

function attachModelChangeListener() {
    modelChangeDisposer?.dispose()
    if (!editor) return
    modelChangeDisposer = editor.onDidChangeModelContent(() => {
        if (!editor) return
        content.value = editor.getValue()
    })
}

async function loadFile(path: string) {
    if (!path) {
        if (editor) editor.setValue('')
        content.value = ''
        baselineContent.value = ''
        return
    }
    loading.value = true
    error.value = null
    isBinary.value = false
    isTruncated.value = false
    // 重置图片状态：切文件时上一张的 object URL 要释放，避免泄露。
    isImage.value = false
    if (imageObjectUrl.value) {
        URL.revokeObjectURL(imageObjectUrl.value)
        imageObjectUrl.value = null
    }
    // 在 fetch 期间临时强制只读：避免用户在 await 窗口内的输入被随后的 setValue 打丢。
    // load 末尾会按 isReadOnly.value 恢复。
    editor?.updateOptions({ readOnly: true })

    // 图片分支：仅 workspace scope，且扩展名命中。agent-file 不走这里，
    // 避免 /raw 端点拓展到 agentDir（目前后端也只提供了 workspace/raw）。
    if (scope.value === 'workspace' && isImagePath(path)) {
        try {
            const blob = await fetchRawFile(props.agentId, path)
            if (path !== props.path) return
            isImage.value = true
            imageObjectUrl.value = URL.createObjectURL(blob)
            // 图片不过 monaco；baseline/content 置空以免误报 dirty。
            content.value = ''
            baselineContent.value = ''
            editor?.updateOptions({ readOnly: true })
            return
        } catch (e: any) {
            if (path !== props.path) return
            error.value = e?.message || String(e)
            return
        } finally {
            if (path === props.path) loading.value = false
        }
    }

    try {
        const data = await fetchByScope(props.agentId, path)
        // path 可能在 await 期间变化，比对最新 props 防过期响应
        if (path !== props.path) return
        ensureEditor()
        if (!editor) return
        const model = editor.getModel()
        const lang = languageFromPath(path)
        if (data.binary) {
            isBinary.value = true
            // 占位空内容 + 强制只读
            if (model) {
                monaco.editor.setModelLanguage(model, 'plaintext')
                model.setValue('')
            }
            content.value = ''
            baselineContent.value = ''
            editor.updateOptions({ readOnly: true })
            return
        }
        isTruncated.value = data.truncated
        if (model) {
            monaco.editor.setModelLanguage(model, lang)
            model.setValue(data.content)
        } else {
            editor.setModel(monaco.editor.createModel(data.content, lang))
        }
        attachModelChangeListener()
        content.value = data.content
        baselineContent.value = data.content
        // truncated 文件强制只读，正常文件可编辑
        editor.updateOptions({ readOnly: isReadOnly.value })
        editor.setScrollPosition({ scrollTop: 0 })
    } catch (e: any) {
        if (path !== props.path) return
        error.value = e?.message || String(e)
    } finally {
        if (path === props.path) loading.value = false
    }
}

async function save(): Promise<boolean> {
    // load 期间拒绝 save：此时 content/baseline 还是上一个文件的，但 props.path 已是新文件，
    // 直接取 editor.getValue() 写出去会把旧内容覆到新路径 → 静默数据损坏。
    if (!editor || isSaving.value || loading.value) return false
    if (isReadOnly.value) return false
    if (!isDirty.value) return true
    // 三联快照：仅当 await 后 props 未变，才可以把中途的 next 记录为新 baseline。
    const pathAtStart = props.path
    const agentAtStart = props.agentId
    const scopeAtStart = scope.value
    const next = editor.getValue()
    isSaving.value = true
    try {
        await saveByScope(agentAtStart, pathAtStart, next)
        if (
            pathAtStart === props.path
            && agentAtStart === props.agentId
            && scopeAtStart === scope.value
        ) {
            baselineContent.value = next
            content.value = next
        }
        toast.success(t('workspace.fileSaved'))
        return true
    } catch (e: any) {
        toast.error(e?.message || String(e))
        return false
    } finally {
        isSaving.value = false
    }
}

// 主题跟随 daisyUI：监听 html data-theme 属性变化
function setupThemeObserver() {
    themeObserver = new MutationObserver(() => {
        if (editor) monaco.editor.setTheme(monacoThemeFromDaisy())
    })
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    })
}

// 预览切换：父组件 Preview 按钮调用。
// .html / .md 都可切换；渲染分支由模板按 previewKind 选择。
const previewKind = computed(() => previewableExt(props.path))
function togglePreview() {
    if (previewKind.value === null) return
    previewMode.value = !previewMode.value
}

// 容器尺寸变化时（splitter 拖动 / 父级 flex 变化）通知 monaco 重排
function setupResizeObserver() {
    if (!containerRef.value) return
    resizeObserver = new ResizeObserver(() => editor?.layout())
    resizeObserver.observe(containerRef.value)
}

onMounted(() => {
    ensureEditor()
    setupResizeObserver()
    setupThemeObserver()
    loadFile(props.path)
})

// path / agentId / scope 变化即重拉
// 同步重置 content/baseline：避免上一个文件的 dirty 状态在 fetch await 窗口内被
// `[isDirty, props.path]` watcher 误认为新文件的 dirty → viewer.dirty 错挂。
// 预览模式也重置：避免从 html 切到别的文件后 Preview 按钮消失但 iframe 残留。
watch(() => [props.agentId, props.path, scope.value], () => {
    content.value = ''
    baselineContent.value = ''
    previewMode.value = false
    loadFile(props.path)
})

// 向全局 viewer dirty 同步：跨组件（HomeView session 切换）检查未保存丢弃。
// path 变化同步重置，避免上一个文件的 dirty 状态泄露到新文件。
watch(
    [isDirty, () => props.path],
    ([dirty, path]) => {
        viewer.setDirty(dirty ? path : null)
    },
    { immediate: true },
)

onBeforeUnmount(() => {
    // 组件卸载（viewer.close 或切出 diff）时主动清一次；
    // viewer.close() 本身也会干这件事，这里是底，防不走 close 路径的卸载场景。
    viewer.setDirty(null)
    resizeObserver?.disconnect()
    themeObserver?.disconnect()
    if (imageObjectUrl.value) {
        URL.revokeObjectURL(imageObjectUrl.value)
        imageObjectUrl.value = null
    }
    disposeEditor()
})

defineExpose({
    isDirty,
    isSaving,
    isBinary,
    isTruncated,
    isReadOnly,
    isImage,
    previewMode,
    togglePreview,
    content,
    save,
})
</script>

<template>
    <div class="relative h-full w-full flex flex-col">
        <!-- 截断 / 二进制 banner：图片不展示 banner（图片需要走专用分支） -->
        <div v-if="isBinary && !isImage" class="bg-warning/10 text-warning text-xs px-3 py-2 border-b border-warning/30 shrink-0">
            ⚠ {{ $t('workspace.binaryFile') }}
        </div>
        <div v-else-if="isTruncated"
            class="bg-warning/10 text-warning text-xs px-3 py-2 border-b border-warning/30 shrink-0">
            ⚠ {{ $t('workspace.fileTruncated') }}
        </div>

        <div class="relative flex-1 min-h-0">
            <!-- 图片：独占容器，居中、等比缩放 -->
            <div v-if="isImage && imageObjectUrl"
                class="absolute inset-0 flex items-center justify-center overflow-auto bg-base-200/40 p-4">
                <img :src="imageObjectUrl" :alt="path"
                    class="max-w-full max-h-full object-contain" />
            </div>

            <!-- HTML 预览：用当前 dirty buffer 走 iframe srcdoc，allow-scripts 但不允许同源 -->
            <iframe v-else-if="previewMode && previewKind === 'html'" :srcdoc="content" sandbox="allow-scripts"
                class="absolute inset-0 h-full w-full bg-white border-0"
                :title="path" />

            <!-- Markdown 预览：复用 chat 的 MarkdownRenderer；v-html 渲染但 markdown-it 默认转义 inline HTML -->
            <div v-else-if="previewMode && previewKind === 'md'"
                class="absolute inset-0 overflow-auto bg-base-100 p-6">
                <MarkdownRenderer :content="content" />
            </div>

            <!-- 编辑器：默认容器；isImage / previewMode 时隐藏，不卸载以避免重创建成本 -->
            <div ref="containerRef" class="h-full w-full"
                :class="{ hidden: isBinary || isImage || previewMode }" />

            <!-- loading 半透明覆盖（不卸载 editor 容器，避免 layout 抖动）-->
            <div v-if="loading"
                class="absolute inset-0 flex items-center justify-center bg-base-100/60 pointer-events-none">
                <span class="loading loading-spinner loading-md text-primary" />
            </div>

            <div v-else-if="error" class="absolute inset-0 flex items-center justify-center p-4 bg-base-100">
                <div class="text-error text-sm font-mono">{{ error }}</div>
            </div>
        </div>
    </div>
</template>
