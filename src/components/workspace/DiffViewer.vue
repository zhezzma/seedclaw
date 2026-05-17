<script setup lang="ts">
/**
 * 单文件 unified diff 渲染。
 *
 * - 用 hljs 的 diff 语言着色（增删行 / hunk header）
 * - binary 文件 / 空 diff / 截断分别给占位文案
 * - props 变化时自动重拉
 */
import { ref, watch, computed } from 'vue'
import { fetchDiff, type DiffMode, type DiffResult } from '../../composables/workspace-api'
import hljs from '../../utils/markdown/hljs'

const props = defineProps<{
    agentId: string
    repo: string
    mode: DiffMode
    file: string
    refSha?: string
}>()

const result = ref<DiffResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
    loading.value = true
    error.value = null
    result.value = null
    try {
        const r = await fetchDiff(props.agentId, {
            repo: props.repo,
            mode: props.mode,
            file: props.file,
            ref: props.refSha,
        })
        result.value = r
    } catch (err: any) {
        error.value = err?.message || String(err)
    } finally {
        loading.value = false
    }
}

watch(
    () => [props.agentId, props.repo, props.mode, props.file, props.refSha],
    load,
    { immediate: true },
)

const html = computed(() => {
    if (!result.value?.diff) return ''
    try {
        return hljs.highlight(result.value.diff, { language: 'diff' }).value
    } catch {
        // 语言不可用时退化为 escape
        return result.value.diff
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
    }
})
</script>

<template>
    <div class="flex flex-col h-full">
        <div v-if="loading" class="flex-1 flex items-center justify-center">
            <span class="loading loading-spinner loading-md" />
        </div>
        <div v-else-if="error" class="p-4 text-error text-sm">{{ error }}</div>
        <template v-else-if="result">
            <div v-if="result.binary" class="flex-1 flex items-center justify-center text-base-content/60">
                {{ $t('workspace.binaryFile') }}
            </div>
            <div v-else-if="!result.diff" class="flex-1 flex items-center justify-center text-base-content/60">
                {{ $t('workspace.noDiff') }}
            </div>
            <template v-else>
                <div v-if="result.truncated"
                    class="bg-warning/10 text-warning text-xs px-3 py-2 border-b border-warning/30">
                    ⚠ {{ $t('workspace.diffTruncated') }}
                </div>
                <div class="flex-1 overflow-auto">
                    <pre class="text-sm font-mono p-2 m-0"><code class="hljs language-diff" v-html="html" /></pre>
                </div>
            </template>
        </template>
    </div>
</template>

<style>
/* hljs diff 行着色（与主题色解耦，纯 RGBA 半透明） */
.hljs.language-diff .hljs-addition {
    background-color: rgba(46, 160, 67, 0.15);
    color: inherit;
    display: block;
}

.hljs.language-diff .hljs-deletion {
    background-color: rgba(248, 81, 73, 0.15);
    color: inherit;
    display: block;
}

.hljs.language-diff .hljs-meta {
    color: #8b5cf6;
}
</style>
