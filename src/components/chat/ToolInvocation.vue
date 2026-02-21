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

const props = defineProps<{
    toolName: string
    args: Record<string, any>
    result?: any
    state?: 'calling' | 'success' | 'error'
    errorMessage?: string
}>()

const { t } = useI18n()
const router = useRouter()

const isOpen = ref(false)

const toggleOpen = () => {
    isOpen.value = !isOpen.value
}

const statusText = computed(() => {
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
    cleaned = cleaned.replace(/\\[nrtbf0v]/g, ' ')
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

/** 点击路径按钮 — 跳转 file-viewer */
function openFilePath(path: string) {
    router.push({ name: 'file-viewer', query: { path } })
}

/** 预览内容 — 通过 router state 传递 */
function previewContent(content: string) {
    router.push({
        name: 'file-viewer',
        query: { preview: 'true' },
        state: { previewContent: content }
    } as any)
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
    </div>
</template>