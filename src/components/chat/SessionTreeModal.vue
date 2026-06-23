<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    ChatBubbleLeftRightIcon,
    CodeBracketSquareIcon,
    CursorArrowRaysIcon,
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
    depth: number
    index: number
    isLeaf: boolean
    isCurrentPath: boolean
}

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

    const currentPathIds = new Set<string>()
    let currentId = props.leafId ?? null
    while (currentId) {
        currentPathIds.add(currentId)
        currentId = entryById.get(currentId)?.parentId ?? null
    }

    const output: TreeRow[] = []
    const visit = (parentId: string | null, depth: number) => {
        const children = childrenByParent.get(parentId) ?? []
        children.forEach(child => {
            output.push({
                entry: child,
                depth,
                index: output.length + 1,
                isLeaf: child.id === props.leafId,
                isCurrentPath: currentPathIds.has(child.id),
            })
            visit(child.id, depth + 1)
        })
    }

    visit(null, 0)
    return output
})

const labelFor = (entry: SessionTreeEntry) => {
    if (entry.type === 'message') {
        if (entry.role === 'user') return t('chat.treeUserNode')
        if (entry.role === 'assistant') return t('chat.treeAssistantNode')
        return t('chat.treeMessageNode')
    }
    if (entry.type === 'branch_summary') return t('chat.treeSummaryNode')
    if (entry.type === 'session_info') return t('chat.treeSessionInfoNode')
    if (entry.type === 'model_change') return t('chat.treeModelNode')
    if (entry.type === 'thinking_level_change') return t('chat.treeThinkingNode')
    return entry.type
}

const canJump = (row: TreeRow) => row.entry.type === 'message'
</script>

<template>
    <Teleport to="body">
        <Transition name="session-tree-fade">
            <div v-if="open" class="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6">
                <button class="absolute inset-0 bg-base-300/55 backdrop-blur-sm" type="button"
                    :aria-label="$t('common.close')" @click="emit('close')"></button>

                <section
                    class="relative w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-[1.75rem] border border-base-content/10 bg-base-100 shadow-2xl">
                    <header
                        class="flex items-center justify-between gap-3 border-b border-base-content/10 bg-base-200/55 px-4 py-3 sm:px-5">
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-base-content/45">
                                <ChatBubbleLeftRightIcon class="h-4 w-4" />
                                <span>{{ $t('chat.sessionTree') }}</span>
                            </div>
                            <h2 class="mt-1 truncate text-lg font-semibold text-base-content">
                                {{ $t('chat.sessionTreeTitle') }}
                            </h2>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm btn-circle" :title="$t('common.close')"
                            @click="emit('close')">
                            <XMarkIcon class="h-5 w-5" />
                        </button>
                    </header>

                    <div class="max-h-[66vh] overflow-y-auto p-3 sm:p-4">
                        <div v-if="rows.length === 0"
                            class="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-base-content/15 px-6 py-12 text-center text-base-content/55">
                            <CodeBracketSquareIcon class="h-10 w-10 opacity-45" />
                            <p>{{ $t('chat.sessionTreeEmpty') }}</p>
                        </div>

                        <div v-else class="space-y-1">
                            <button v-for="row in rows" :key="row.entry.id" type="button" :disabled="!canJump(row) || busy"
                                class="group grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-2xl border px-3 py-2 text-left transition disabled:cursor-default disabled:opacity-70"
                                :class="row.isLeaf ? 'border-primary/45 bg-primary/10' : row.isCurrentPath ? 'border-base-content/15 bg-base-200/45' : canJump(row) ? 'border-transparent hover:border-base-content/10 hover:bg-base-200/55' : 'border-transparent bg-base-200/20'"
                                :style="{ marginLeft: `${Math.min(row.depth, 8) * 1.1}rem`, width: `calc(100% - ${Math.min(row.depth, 8) * 1.1}rem)` }"
                                @click="canJump(row) && emit('jump-to-entry', row.entry.id)">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <span
                                            class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-base-content/10 px-1.5 text-[11px] font-semibold text-base-content/55">
                                            {{ row.index }}
                                        </span>
                                        <span class="truncate text-sm font-medium text-base-content">
                                            {{ labelFor(row.entry) }}
                                        </span>
                                        <span v-if="row.entry.preview" class="min-w-0 truncate text-sm text-base-content/65">
                                            {{ row.entry.preview }}
                                        </span>
                                        <span v-if="row.isLeaf" class="badge badge-primary badge-sm shrink-0">
                                            {{ $t('chat.treeCurrent') }}
                                        </span>
                                    </div>
                                    <div class="mt-1 truncate pl-8 font-mono text-[11px] text-base-content/40">
                                        {{ row.entry.id }}
                                    </div>
                                </div>

                                <span v-if="canJump(row)" class="inline-flex items-center gap-1 text-xs text-primary/80">
                                    <CursorArrowRaysIcon class="h-3.5 w-3.5" />
                                    {{ $t('chat.jumpToMessage') }}
                                </span>
                                <span v-else class="text-xs text-base-content/30">
                                    {{ $t('chat.treeViewOnly') }}
                                </span>
                            </button>
                        </div>
                    </div>
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
