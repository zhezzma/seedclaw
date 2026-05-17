<script setup lang="ts">
/**
 * VSCode 风格的状态分组：Changes / Staged / Untracked。
 *
 * 每行点击 → 调用父级传入的 onClick 处理函数（最终走到 viewer.openDiff）。
 * 状态字符按 git 语义映射颜色，与 VSCode 颜色约定保持一致。
 */
import { ref } from 'vue'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'
import type { FileChange } from '../../../composables/workspace-api'

const props = defineProps<{
    title: string
    changes: FileChange[]
    defaultOpen?: boolean
    onClick: (change: FileChange) => void
}>()

const open = ref(props.defaultOpen !== false)

/**
 * git porcelain 状态字符 → daisyUI 语义颜色类
 *  M / T 修改 → warning（黄）
 *  A      新增 → success（绿）
 *  D      删除 → error（红）
 *  R / C  重命名 / 复制 → info（蓝）
 *  U      合并冲突 → error 加粗
 *  ?      未跟踪 → success
 */
function statusClass(s: string): string {
    if (s === 'M' || s === 'T') return 'text-warning'
    if (s === 'A') return 'text-success'
    if (s === 'D') return 'text-error'
    if (s === 'R' || s === 'C') return 'text-info'
    if (s === 'U') return 'text-error font-bold'
    if (s === '?') return 'text-success'
    return ''
}
</script>

<template>
    <div v-if="changes.length > 0" class="border-b border-base-200">
        <button class="flex items-center gap-1 w-full text-left text-xs px-2 py-1 hover:bg-base-200"
            @click="open = !open">
            <ChevronDownIcon v-if="open" class="h-3 w-3" />
            <ChevronRightIcon v-else class="h-3 w-3" />
            <span class="font-medium">{{ title }} ({{ changes.length }})</span>
        </button>
        <div v-if="open">
            <button v-for="(change, idx) in changes" :key="`${change.path}-${idx}`"
                class="flex items-center gap-2 w-full text-left text-xs px-3 py-1 hover:bg-base-200 font-mono"
                :title="change.path" @click="onClick(change)">
                <span class="w-3 shrink-0" :class="statusClass(change.status)">{{ change.status }}</span>
                <span class="truncate flex-1">
                    <template v-if="change.oldPath">{{ change.path }} ← {{ change.oldPath }}</template>
                    <template v-else>{{ change.path }}</template>
                </span>
            </button>
        </div>
    </div>
</template>
