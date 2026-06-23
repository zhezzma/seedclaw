<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    ChatBubbleLeftRightIcon,
    CodeBracketSquareIcon,
    XMarkIcon,
} from '@heroicons/vue/24/outline'
import type { SessionTreeEntry } from '../../composables/useChatState'

const props = defineProps<{
    open: boolean
    entries: SessionTreeEntry[] | null
    leafId?: string | null
    busy?: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'jump-to-entry', entryId: string): void
}>()

const { t } = useI18n()

type TreeRow = {
    entry: SessionTreeEntry
    /** 树形前缀（box-drawing 字符），等宽渲染 */
    prefix: string
    isLeaf: boolean
    isOnActivePath: boolean
}

/**
 * 把 flat entries 还原成树，并生成 TUI 风格的 ├─ └─ │ 前缀。
 * - gutters[i] 表示第 i 层祖先后面是否还有兄弟（决定是否画竖线 │）
 * - 节点自身按是否最后一个兄弟画 ├─ / └─
 */
const rows = computed<TreeRow[]>(() => {
    const entries = props.entries ?? []
    const childrenByParent = new Map<string | null, SessionTreeEntry[]>()
    const entryById = new Map<string, SessionTreeEntry>()

    entries.forEach(entry => {
        entryById.set(entry.id, entry)
        const key = entry.parentId ?? null
        const bucket = childrenByParent.get(key)
        if (bucket) bucket.push(entry)
        else childrenByParent.set(key, [entry])
    })

    // 当前分支（leaf → root）路径
    const activePathIds = new Set<string>()
    let cursor = props.leafId ?? null
    while (cursor) {
        activePathIds.add(cursor)
        cursor = entryById.get(cursor)?.parentId ?? null
    }

    const output: TreeRow[] = []

    const visit = (node: SessionTreeEntry, gutters: boolean[], isLast: boolean, depth: number) => {
        let prefix = ''
        for (const hasNext of gutters) prefix += hasNext ? '│  ' : '   '
        if (depth > 0) prefix += isLast ? '└─ ' : '├─ '

        output.push({
            entry: node,
            prefix,
            isLeaf: node.id === props.leafId,
            isOnActivePath: activePathIds.has(node.id),
        })

        const children = childrenByParent.get(node.id) ?? []
        children.forEach((child, i) => {
            const childIsLast = i === children.length - 1
            visit(child, depth > 0 ? [...gutters, !isLast] : gutters, childIsLast, depth + 1)
        })
    }

    const roots = childrenByParent.get(null) ?? []
    roots.forEach((root, i) => {
        visit(root, [], i === roots.length - 1, 0)
    })

    return output
})

/** TUI 风格：role 前缀文案 */
const roleLabel = (entry: SessionTreeEntry): string => {
    if (entry.type === 'message') {
        if (entry.role === 'user') return 'user: '
        if (entry.role === 'assistant') return 'assistant: '
        if (entry.role === 'toolResult') return '[tool] '
        return `[${entry.role ?? 'message'}] `
    }
    if (entry.type === 'branch_summary') return '[branch summary] '
    if (entry.type === 'session_info') return '[title] '
    if (entry.type === 'model_change') return '[model] '
    if (entry.type === 'thinking_level_change') return '[thinking] '
    return `[${entry.type}] `
}

/** role 前缀着色 */
const roleClass = (entry: SessionTreeEntry): string => {
    if (entry.type === 'message') {
        if (entry.role === 'user') return 'text-info'
        if (entry.role === 'assistant') return 'text-success'
        return 'text-base-content/45'
    }
    if (entry.type === 'branch_summary') return 'text-warning'
    return 'text-base-content/40'
}

const bodyText = (entry: SessionTreeEntry): string => {
    if (entry.preview) return entry.preview
    if (entry.type === 'message' && entry.role === 'assistant') return t('chat.treeNoContent')
    return ''
}

const canJump = (entry: SessionTreeEntry) => entry.type === 'message'

const onRowClick = (row: TreeRow) => {
    if (props.busy || !canJump(row.entry)) return
    emit('jump-to-entry', row.entry.id)
}
</script>

<template>
    <Teleport to="body">
        <Transition name="session-tree-fade">
            <div v-if="open" class="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6">
                <button class="absolute inset-0 bg-base-300/55 backdrop-blur-sm" type="button"
                    :aria-label="$t('common.close')" @click="emit('close')"></button>

                <section
                    class="relative flex w-full max-w-3xl max-h-[86vh] flex-col overflow-hidden rounded-2xl border border-base-content/10 bg-base-100 shadow-2xl">
                    <header
                        class="flex items-center justify-between gap-3 border-b border-base-content/10 bg-base-200/55 px-4 py-3">
                        <div class="flex items-center gap-2 min-w-0">
                            <ChatBubbleLeftRightIcon class="h-4 w-4 text-base-content/45 shrink-0" />
                            <h2 class="truncate text-sm font-semibold text-base-content">
                                {{ $t('chat.sessionTreeTitle') }}
                            </h2>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm btn-circle" :title="$t('common.close')"
                            @click="emit('close')">
                            <XMarkIcon class="h-5 w-5" />
                        </button>
                    </header>

                    <div class="flex-1 overflow-auto bg-base-100 px-2 py-2">
                        <div v-if="rows.length === 0"
                            class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-base-content/50">
                            <CodeBracketSquareIcon class="h-9 w-9 opacity-45" />
                            <p class="text-sm">{{ $t('chat.sessionTreeEmpty') }}</p>
                        </div>

                        <div v-else class="font-mono text-[13px] leading-6 whitespace-nowrap">
                            <div v-for="row in rows" :key="row.entry.id"
                                class="flex items-center rounded px-1 transition-colors"
                                :class="[
                                    canJump(row.entry) ? 'cursor-pointer hover:bg-base-200/70' : 'cursor-default',
                                    row.isLeaf ? 'bg-primary/10' : '',
                                    busy ? 'pointer-events-none opacity-60' : '',
                                ]"
                                @click="onRowClick(row)">
                                <!-- 树形前缀（box-drawing），等宽对齐 -->
                                <span class="select-none text-base-content/30">{{ row.prefix }}</span>
                                <!-- 当前分支标记 -->
                                <span v-if="row.isOnActivePath" class="select-none text-primary">• </span>
                                <!-- role 前缀 -->
                                <span class="select-none font-semibold" :class="roleClass(row.entry)">
                                    {{ roleLabel(row.entry) }}
                                </span>
                                <!-- 正文预览 -->
                                <span class="truncate text-base-content/80">{{ bodyText(row.entry) }}</span>
                                <!-- 当前叶子徽标 -->
                                <span v-if="row.isLeaf"
                                    class="ml-2 shrink-0 rounded bg-primary/20 px-1.5 text-[11px] font-sans text-primary">
                                    {{ $t('chat.treeCurrent') }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <footer
                        class="border-t border-base-content/10 bg-base-200/40 px-4 py-2 text-center text-[11px] text-base-content/45">
                        {{ $t('chat.treeJumpHint') }}
                    </footer>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.session-tree-fade-enter-active,
.session-tree-fade-leave-active {
    transition: opacity 160ms ease;
}

.session-tree-fade-enter-from,
.session-tree-fade-leave-to {
    opacity: 0;
}
</style>
