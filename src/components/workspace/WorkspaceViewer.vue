<script setup lang="ts">
/**
 * Viewer 模式容器：替换聊天区显示文件内容或 diff。
 *
 * - 顶部面包屑 + 返回聊天按钮
 * - 按 Esc 关闭（onMounted + target 变化时主动取焦点，避免 ChatInput textarea 抢点）
 * - 通过 viewer.current.type 路由到 FileView 或 DiffViewer
 */
import { onMounted, onUnmounted, computed, ref, watch, nextTick } from 'vue'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import WorkspaceFileView from './WorkspaceFileView.vue'
import DiffViewer from './DiffViewer.vue'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'

const props = defineProps<{ agentId: string }>()
const viewer = useWorkspaceViewer()
const rootRef = ref<HTMLDivElement | null>(null)

const target = computed(() => viewer.current.value)

const breadcrumb = computed(() => {
    const t = target.value
    if (!t) return ''
    if (t.type === 'file') return t.path
    if (t.type === 'diff') {
        const sha = t.ref ? ` @ ${t.ref.slice(0, 7)}` : ''
        return `${t.repo} / ${t.file}${sha}`
    }
    return ''
})

function onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (e.isComposing) return
    // 不拦截输入框内的 Esc（让 IME / 其它引用正常工作）。
    // viewer 初始以及 target 切换时主动取焦点，保证默认情况下 Esc 能流到这里。
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    viewer.close()
}

async function focusRoot() {
    await nextTick()
    rootRef.value?.focus()
}

onMounted(() => {
    document.addEventListener('keydown', onEscape)
    focusRoot()
})
onUnmounted(() => document.removeEventListener('keydown', onEscape))

// 在同一个 viewer 实例内切换 target（用户从 panel 点不同文件）时重取焦点，
// 以防中途用户点过 ChatInput textarea 导致 Esc 被 textarea 吞掉。
watch(target, () => {
    if (target.value) focusRoot()
})
</script>

<template>
    <div ref="rootRef" tabindex="-1" role="region" :aria-label="breadcrumb || $t('workspace.tabFiles')"
        class="flex flex-col h-full bg-base-100 outline-none">
        <div class="flex items-center gap-2 p-2 border-b border-base-200 shrink-0">
            <button class="btn btn-ghost btn-sm btn-circle" :title="$t('common.back')" @click="viewer.close()">
                <ArrowLeftIcon class="h-5 w-5" />
            </button>
            <div class="flex-1 min-w-0 truncate text-sm font-mono text-base-content/70">{{ breadcrumb }}</div>
        </div>
        <div class="flex-1 min-h-0 overflow-hidden">
            <WorkspaceFileView v-if="target?.type === 'file'" :path="target.path" />
            <DiffViewer v-else-if="target?.type === 'diff'" :agent-id="agentId" :repo="target.repo"
                :mode="target.mode" :file="target.file" :ref-sha="target.ref" />
        </div>
    </div>
</template>
