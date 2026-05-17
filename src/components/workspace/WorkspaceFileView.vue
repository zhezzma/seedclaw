<script setup lang="ts">
/**
 * Workspace 专用文件查看器，基于 monaco-editor。
 *
 * 设计原则：
 * - 由父 WorkspaceViewer 提供面包屑 + 返回按钮，本组件不带 header
 * - **path 变化即重拉**（watch immediate）——与 FileView 的关键差异
 * - 默认 readOnly；语言根据扩展名自动选；主题跟随 daisyUI 切换
 * - 组件销毁时 dispose editor 与 model，避免 worker 泄漏
 *
 * 未来：把 readOnly 改成 prop，结合保存按钮即可解锁编辑。
 */
import { ref, watch, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { apiPost } from '../../composables/api-client'
import { monaco, languageFromPath, monacoThemeFromDaisy } from './monaco-setup'

const props = defineProps<{
    path: string
}>()

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const loading = ref(false)
const error = ref<string | null>(null)

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function ensureEditor() {
    if (editor || !containerRef.value) return
    editor = monaco.editor.create(containerRef.value, {
        value: '',
        language: 'plaintext',
        theme: monacoThemeFromDaisy(),
        readOnly: true,
        automaticLayout: false, // 自己用 ResizeObserver 控制（automaticLayout 在隐藏容器中会跳）
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        wordWrap: 'off',
        smoothScrolling: true,
        // 减少 Esc 被 monaco 吞掉的几率（Esc 由 WorkspaceViewer 监听用于关闭）
        // monaco 默认会在 cmd panel 打开时拦截 Esc，readOnly 模式不开 cmd panel
    })
}

function disposeEditor() {
    if (editor) {
        const model = editor.getModel()
        editor.dispose()
        model?.dispose()
        editor = null
    }
}

async function loadFile(path: string) {
    if (!path) {
        if (editor) editor.setValue('')
        return
    }
    loading.value = true
    error.value = null
    try {
        const data = await apiPost<{ content: string }>('/api/files/open', { path })
        // path 可能在 await 期间变化，比对最新 props 防过期响应
        if (path !== props.path) return
        ensureEditor()
        if (!editor) return
        const model = editor.getModel()
        const lang = languageFromPath(path)
        if (model) {
            // 复用已有 model：setValue 比销毁重建快得多
            monaco.editor.setModelLanguage(model, lang)
            model.setValue(data.content)
        } else {
            editor.setModel(monaco.editor.createModel(data.content, lang))
        }
        editor.setScrollPosition({ scrollTop: 0 })
    } catch (e: any) {
        if (path !== props.path) return
        error.value = e?.message || String(e)
    } finally {
        if (path === props.path) loading.value = false
    }
}

// 主题跟随 daisyUI：监听 html data-theme 属性变化
function setupThemeObserver() {
    themeObserver = new MutationObserver(() => {
        if (editor) {
            monaco.editor.setTheme(monacoThemeFromDaisy())
        }
    })
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    })
}

// 容器尺寸变化时（splitter 拖动 / 父级 flex 变化）通知 monaco 重排
function setupResizeObserver() {
    if (!containerRef.value) return
    resizeObserver = new ResizeObserver(() => {
        editor?.layout()
    })
    resizeObserver.observe(containerRef.value)
}

onMounted(() => {
    ensureEditor()
    setupResizeObserver()
    setupThemeObserver()
    // 首次加载（onMounted 后 props 已定）
    loadFile(props.path)
})

// path 变化即重拉
watch(() => props.path, (newPath) => {
    loadFile(newPath)
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    themeObserver?.disconnect()
    disposeEditor()
})
</script>

<template>
    <div class="relative h-full w-full">
        <div ref="containerRef" class="h-full w-full" />

        <!-- loading 半透明覆盖（不卸载 editor 容器，避免 layout 抖动）-->
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-base-100/60 pointer-events-none">
            <span class="loading loading-spinner loading-md text-primary" />
        </div>

        <div v-else-if="error" class="absolute inset-0 flex items-center justify-center p-4 bg-base-100">
            <div class="text-error text-sm font-mono">{{ error }}</div>
        </div>
    </div>
</template>
