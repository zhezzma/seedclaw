<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
    WrenchScrewdriverIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    EyeIcon
} from '@heroicons/vue/24/outline'
import FileView from '../../views/FileView.vue'

const props = defineProps<{
    toolName: string
    args: Record<string, any>
    result?: any
    state?: 'calling' | 'success' | 'error'
    errorMessage?: string
    details?: any  // subagent/delegate 进度详情
}>()

const { t } = useI18n()
const router = useRouter()

const isOpen = ref(false)

const toggleOpen = () => {
    isOpen.value = !isOpen.value
}

// ─── Subagent/Delegate 相关 ─────────────────────────
const isSubagentTool = computed(() => {
    return props.toolName === 'subagent' || props.toolName === 'delegate'
})

/** 子代理结果列表 */
const subagentResults = computed(() => {
    return props.details?.results || []
})

/** 子代理整体状态文字 */
const subagentStatusText = computed(() => {
    return props.details?.statusText || ''
})

/** 子代理模式 */
const subagentMode = computed(() => {
    return props.details?.mode || 'single'
})

/** 获取子代理状态对应的图标 */
function getStatusIcon(status?: string) {
    switch (status) {
        case 'pending': return '⏳'
        case 'initializing': return '⏳'
        case 'thinking': return '🧠'
        case 'tool_running': return '🔧'
        case 'completed': return '✅'
        case 'error': return '❌'
        case 'aborted': return '⛔'
        default: return '⏳'
    }
}

/** 获取状态对应的 CSS 颜色类 */
function getStatusColorClass(status?: string) {
    switch (status) {
        case 'thinking': return 'text-info'
        case 'tool_running': return 'text-warning'
        case 'completed': return 'text-success'
        case 'error': return 'text-error'
        case 'aborted': return 'text-error'
        default: return 'text-base-content/60'
    }
}

/** 格式化状态文字 */
function getStatusLabel(status?: string) {
    switch (status) {
        case 'pending': return '等待中'
        case 'initializing': return '初始化中'
        case 'thinking': return '思考中'
        case 'tool_running': return '执行工具'
        case 'completed': return '已完成'
        case 'error': return '出错'
        case 'aborted': return '已中止'
        default: return '运行中'
    }
}

/** 格式化耗时 */
function formatElapsed(startedAt?: number) {
    if (!startedAt) return ''
    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    if (elapsed < 60) return `${elapsed}s`
    const min = Math.floor(elapsed / 60)
    const sec = elapsed % 60
    return `${min}m ${sec}s`
}

/** 格式化 token 数量 */
function formatTokens(count: number) {
    if (count < 1000) return count.toString()
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`
    return `${Math.round(count / 1000)}k`
}

const statusText = computed(() => {
    // 对 subagent/delegate 工具显示更丰富的状态
    if (isSubagentTool.value && props.state === 'calling') {
        const results = subagentResults.value
        if (results.length === 0) return t('tool.calling', { toolName: props.toolName })

        if (subagentMode.value === 'parallel') {
            const done = results.filter((r: any) => r.exitCode !== -1 && r.status === 'completed').length
            return `${props.toolName} — 并行执行中 ${done}/${results.length}`
        }

        const r = results[results.length - 1]
        const icon = getStatusIcon(r?.status)
        const label = getStatusLabel(r?.status)
        return `${icon} ${props.toolName}: ${r?.agent || ''} ${label}`
    }
    switch (props.state) {
        case 'calling':
            return t('tool.calling', { toolName: props.toolName })
        case 'success':
            return t('tool.used', { toolName: props.toolName })
        case 'error':
            return t('tool.failed', { toolName: props.toolName })
        default:
            return props.toolName
    }
})

const formatJson = (data: any) => {
    try {
        if (typeof data === 'string') {
            // Try to parse if it looks like JSON object/array
            if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
                return JSON.stringify(JSON.parse(data), null, 2)
            }
            return data
        }
        return JSON.stringify(data, null, 2)
    } catch (e) {
        return String(data)
    }
}

/**
 * 判断结果是否为特定格式：[{ "type": "text", "text": "..." }, ...]
 * 如果是，则提取其文本内容直接显示。
 */
const textResultContent = computed(() => {
    if (!props.result) return null

    // 如果 result 是数组
    if (Array.isArray(props.result)) {
        // 检查是否每一项都是 { type: 'text', text: '...' }
        const isAllText = props.result.every(item =>
            item &&
            typeof item === 'object' &&
            item.type === 'text' &&
            typeof item.text === 'string'
        )

        if (isAllText && props.result.length > 0) {
            return props.result.map(item => item.text).join('\n')
        }
    }

    // 如果 result 本身就是单一的 { type: 'text', text: '...' }
    if (props.result && typeof props.result === 'object' && props.result.type === 'text' && typeof props.result.text === 'string') {
        return props.result.text
    }

    return null
})

/**
 * 从文本中提取合法的文件路径（支持 Unix 和 Windows 路径）
 * Unix:    /home/user/file.txt
 * Windows: D:\folder\file.ts  D:\\folder\\file.ts  D:/folder/file.ts
 * 排除 URL 和 JSON 转义序列（\n \t \r 等）
 */
function extractPaths(text: string): string[] {
    if (!text) return []
    // 1. 移除 URL，防止 URL 路径被误提取
    let cleaned = text.replace(/(?:https?|ftp|wss?):\/\/[^\s"'`,;[\]{}()]+/gi, '')
    // 2. 移除 JSON 转义序列（\n \t \r \0 等），防止 \n 被视为路径
    //    使用负向后瞻 (?<!\\) 确保不会破坏路径中的 \\t (如 \\test_xxx.txt)
    cleaned = cleaned.replace(/(?<!\\)\\[nrtbf0v]/g, ' ')
    const patterns = [
        // Windows: D:\ or D:\\ or D:/ 后跟路径段，最终以 .ext 结尾（文件名）
        /[A-Za-z]:[\\\/](?:[^\s"'`,;\[\]{}()]*[\\\/])*[^\s"'`,;\[\]{}()\\\/]+\.[A-Za-z0-9_]{1,20}/g,
        // Unix absolute: /xxx/yyy/file.ext（至少 2 段且以 .ext 结尾）
        /\/(?:[\w.\-@]+\/)+[\w\-@]+\.[\w]{1,20}/g,
    ]
    const results = new Set<string>()
    for (const regex of patterns) {
        const matches = cleaned.match(regex) || []
        for (const m of matches) {
            // 清理尾部的标点符号（但保留 .ext）
            const trimmed = m.replace(/[,;:!?)\]]+$/, '')
            // 确保仍然有扩展名
            if (trimmed.length > 2 && /\.\w+$/.test(trimmed)) results.add(trimmed)
        }
    }
    return [...results]
}

/** 获取路径的文件名（basename） */
function basename(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || path
}

/** Args 中提取到的路径 */
const argsPaths = computed(() => {
    return extractPaths(formatJson(props.args))
})

/** Result 中提取到的路径 */
const resultPaths = computed(() => {
    const text = textResultContent.value ?? formatJson(props.result)
    return extractPaths(text)
})

const showModal = ref(false)
const modalPath = ref('')
const modalPreview = ref(false)
const modalPreviewContent = ref('')

/** 点击路径按钮 — 弹出 file-viewer */
function openFilePath(path: string) {
    modalPath.value = path
    modalPreview.value = false
    modalPreviewContent.value = ''
    showModal.value = true
}

/** 预览内容 — 弹出 file-viewer */
function previewContent(content: string) {
    modalPath.value = ''
    modalPreview.value = true
    modalPreviewContent.value = content
    showModal.value = true
}

function closeModal() {
    showModal.value = false
}
</script>

<template>
    <div class="card bg-base-200/50 border border-base-300 shadow-sm overflow-hidden my-2 text-sm">
        <!-- Header -->
        <div @click="toggleOpen"
            class="flex items-center gap-2 p-3 cursor-pointer hover:bg-base-200 transition-colors select-none">
            <!-- Status Icon -->
            <div class="flex-none">
                <span v-if="state === 'calling'" class="loading loading-spinner loading-xs text-primary"></span>
                <CheckCircleIcon v-else-if="state === 'success'" class="w-5 h-5 text-success" />
                <ExclamationCircleIcon v-else-if="state === 'error'" class="w-5 h-5 text-error" />
                <WrenchScrewdriverIcon v-else class="w-5 h-5 text-base-content/70" />
            </div>

            <!-- Title -->
            <div class="flex-1 font-medium text-base-content/80">
                {{ statusText }}
            </div>

            <!-- Toggle Icon -->
            <div class="flex-none text-base-content/50">
                <ChevronDownIcon v-if="isOpen" class="w-4 h-4" />
                <ChevronRightIcon v-else class="w-4 h-4" />
            </div>
        </div>

        <!-- Subagent Progress (visible even when collapsed) -->
        <div v-if="isSubagentTool && state === 'calling' && subagentResults.length > 0"
            class="border-t border-base-300 bg-base-100/30 px-3 py-2">
            <div v-for="(r, idx) in subagentResults" :key="idx"
                class="flex items-center gap-2 py-1" :class="{ 'border-t border-base-200 mt-1 pt-1': Number(idx) > 0 }">
                <!-- Status icon -->
                <span class="text-sm flex-none">{{ getStatusIcon(r.status) }}</span>
                <!-- Agent name -->
                <span class="font-mono text-xs font-semibold" :class="getStatusColorClass(r.status)">{{ r.agent }}</span>
                <!-- Status label -->
                <span class="text-xs" :class="getStatusColorClass(r.status)">{{ getStatusLabel(r.status) }}</span>
                <!-- Current tool (if running) -->
                <span v-if="r.status === 'tool_running' && r.currentTool" class="text-xs text-warning/80 font-mono">→ {{ r.currentTool }}</span>
                <!-- Turn info -->
                <span v-if="Number(r.usage?.turns) > 0" class="text-xs text-base-content/40">Turn {{ r.usage.turns }}</span>
                <!-- Elapsed -->
                <span v-if="r.startedAt" class="text-xs text-base-content/40 ml-auto">{{ formatElapsed(r.startedAt) }}</span>
            </div>
            <!-- Streaming text preview -->
            <div v-if="subagentResults.length === 1 && subagentResults[0].streamingText && subagentResults[0].status === 'thinking'"
                class="mt-1 text-xs text-base-content/50 font-mono truncate max-w-full">
                <span class="opacity-60">▸ </span>{{ subagentResults[0].streamingText.slice(-150) }}
            </div>
        </div>

        <!-- Details Body -->
        <div v-if="isOpen" class="border-t border-base-300 bg-base-100/50">
            <div class="p-3 space-y-3">
                <!-- Arguments -->
                <div>
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wider">{{
                            $t('tool.args') }}</div>
                        <!-- Preview button -->
                        <button class="btn btn-ghost btn-xs gap-0.5 text-base-content/50 hover:text-primary"
                            @click="previewContent(formatJson(args))" :title="$t('tool.preview')">
                            <EyeIcon class="w-3.5 h-3.5" />
                        </button>
                        <!-- Path buttons -->
                        <button v-for="p in argsPaths" :key="p"
                            class="btn btn-ghost btn-xs font-mono text-primary/80 hover:text-primary hover:bg-primary/10"
                            :title="p" @click="openFilePath(p)">
                            {{ basename(p) }}
                        </button>
                    </div>
                    <pre
                        class="bg-base-300/50 p-2 rounded text-xs font-mono overflow-x-auto">{{ formatJson(args) }}</pre>
                </div>

                <!-- Result -->
                <div v-if="result">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wider">{{
                            $t('tool.result') }}</div>
                        <!-- Preview button -->
                        <button class="btn btn-ghost btn-xs gap-0.5 text-base-content/50 hover:text-primary"
                            @click="previewContent(textResultContent ?? formatJson(result))"
                            :title="$t('tool.preview')">
                            <EyeIcon class="w-3.5 h-3.5" />
                        </button>
                        <!-- Path buttons -->
                        <button v-for="p in resultPaths" :key="p"
                            class="btn btn-ghost btn-xs font-mono text-primary/80 hover:text-primary hover:bg-primary/10"
                            :title="p" @click="openFilePath(p)">
                            {{ basename(p) }}
                        </button>
                    </div>

                    <!-- 优化：如果包含纯文本结果，直接展示 -->
                    <div v-if="textResultContent !== null"
                        class="bg-base-300/50 p-2 rounded text-xs text-base-content/80 whitespace-pre-wrap break-words leading-relaxed overflow-x-auto max-h-96">
                        {{ textResultContent }}
                    </div>

                    <!-- 否则显示原始 JSON 格式 -->
                    <pre v-else
                        class="bg-base-300/50 p-2 rounded text-xs font-mono overflow-x-auto max-h-60">{{ formatJson(result) }}</pre>
                </div>

                <!-- Error -->
                <div v-if="errorMessage">
                    <div class="text-xs font-semibold text-error mb-1 uppercase tracking-wider">{{ $t('tool.error') }}
                    </div>
                    <pre
                        class="bg-error/10 text-error p-2 rounded text-xs font-mono overflow-x-auto">{{ errorMessage }}</pre>
                </div>
            </div>
        </div>

        <!-- File Viewer Modal -->
        <Teleport to="body" v-if="showModal">
            <dialog class="modal modal-open">
                <div
                    class="modal-box w-full max-w-full h-full max-h-full rounded-none sm:w-11/12 sm:max-w-5xl sm:h-[85vh] sm:max-h-[85vh] sm:rounded-lg p-0 overflow-hidden flex flex-col bg-base-100 shadow-xl sm:border sm:border-base-300">
                    <FileView is-modal :path="modalPath" :preview="modalPreview" :preview-content="modalPreviewContent"
                        @close="closeModal" />
                </div>
                <div class="modal-backdrop bg-base-300/50 backdrop-blur-sm" @click="closeModal">
                    <button class="sr-only">close</button>
                </div>
            </dialog>
        </Teleport>
    </div>
</template>