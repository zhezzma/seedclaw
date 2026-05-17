<script setup lang="ts">
/**
 * Workspace Panel 外壳：
 * - 提供 tab 切换 (Files / Git)，子组件用 :key=agentId 跨 agent 强制 remount
 * - 左侧 splitter 拖动调整宽度（240～600）；拖动时用本地 ref 实时刷新视觉，
 *   仅 mouseup 时一次性 persist 到 settings store，避免每像素一次 localStorage 写
 * - 顶部刷新按钮真正重拉数据（清缓存 + 立即 reload）
 * - Agent 切换时 reset 所有缓存
 *
 * 模板用单根 `<div class="contents">` 包裹 splitter + aside：Vue 3 多根 SFC 不会
 * fallthrough class 到子节点，外部传入的 `class="hidden lg:flex"` 会静默丢失。
 * `display:contents` 让 wrapper 不参与布局，splitter 与 aside 仍是父 flex 的 item。
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { XMarkIcon, ArrowPathIcon, FolderIcon, CodeBracketIcon } from '@heroicons/vue/24/outline'
import { useWorkspacePanel } from '../../composables/useWorkspacePanel'
import { useWorkspaceTree } from '../../composables/useWorkspaceTree'
import { useWorkspaceGit } from '../../composables/useWorkspaceGit'
import { useAgentFiles } from '../../composables/useAgentFiles'
import WorkspaceTabFiles from './WorkspaceTabFiles.vue'
import WorkspaceTabGit from './WorkspaceTabGit.vue'

const props = defineProps<{ agentId: string; mobile?: boolean }>()

const panel = useWorkspacePanel()
const tree = useWorkspaceTree()
const git = useWorkspaceGit()
const agentFiles = useAgentFiles()

// ─── Agent 切换隔离 ──────────────────────────────────────────────
// agent 改变时清掉 Files / Git 全部缓存；tab 子组件用 :key=agentId 强制 remount，
// 让其 onMounted 重新拉数据。flush:'pre' 让 reset 在子组件 remount 之前完成，
// 避免新组件 onMounted 拉的数据被随后的 reset 清掉。
watch(() => props.agentId, () => {
    tree.reset()
    git.reset()
    agentFiles.reset()
}, { flush: 'pre' })

// ─── splitter 拖动 ───────────────────────────────────────────────
// 拖动期间用 dragWidth 驱动 UI，避免每帧 persist 到 localStorage。
// dragWidth 为 null 表示未在拖动，使用 store 里的 width。
const isDragging = ref(false)
const dragWidth = ref<number | null>(null)
let dragStartX = 0
let dragStartWidth = 0

const effectiveWidth = computed(() => dragWidth.value ?? panel.width.value)

function clamp(w: number): number {
    return Math.max(240, Math.min(600, Math.round(w)))
}

function onSplitterMouseDown(e: MouseEvent) {
    isDragging.value = true
    dragStartX = e.clientX
    dragStartWidth = panel.width.value
    dragWidth.value = dragStartWidth
    document.body.style.cursor = 'col-resize'
    e.preventDefault()
}
function onMouseMove(e: MouseEvent) {
    if (!isDragging.value) return
    // panel 在右侧：鼠标向左 → 宽度增加
    const delta = dragStartX - e.clientX
    dragWidth.value = clamp(dragStartWidth + delta)
}
function onMouseUp() {
    if (!isDragging.value) return
    isDragging.value = false
    document.body.style.cursor = ''
    if (dragWidth.value !== null) {
        // 仅在拖动结束时 persist 一次
        panel.setWidth(dragWidth.value)
        dragWidth.value = null
    }
}
function onSplitterDblClick() {
    panel.resetWidth()
    dragWidth.value = null
}

onMounted(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
})
onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    // 防 mid-drag 时面板被退出（Ctrl+B / agent 删除）造成全局鼠标塑形残留
    document.body.style.cursor = ''
})

// ─── 顶部刷新 ────────────────────────────────────────────────────
// 真正重拉，而不是只清缓存。spec §6.4: 顶部 🔄 = 全部刷新。
// - Files tab 下：保留 expanded 路径，refresh 后并发重拉，避免用户辛苦展开的深层目录折叠回去
// - Git tab 下：先 await loadRepos 拿最新列表，再决定当前 repo 是否还有效（避免对外部已删除的 repo 拉数据）
// ─── 顶部刷新 ───────────────────────────────────────
// 真正重拉，而不是只清缓存。spec §6.4: 顶部 🔄 = 全部刷新。
// - Files tab 下：保留 expanded 路径，refresh 后并发重拉，避免用户辛苦展开的深层目录折叠回去
// - Git tab 下：先 await loadRepos 拿最新列表，再决定当前 repo 是否还有效（避免对外部已删除的 repo 拉数据）
// isRefreshing 守卫：避免连点高频重复请求
const isRefreshing = ref(false)
async function refresh() {
    if (isRefreshing.value) return
    isRefreshing.value = true
    try {
        if (panel.activeTab.value === 'files') {
            const expandedPaths = tree.expandedPaths()
            tree.refresh()
            await tree.loadPath(props.agentId, '')
            await Promise.all(expandedPaths.map(p => tree.loadPath(props.agentId, p)))
            // 底部 agent 文件区只在展开时才重拉，避免隐式快照过鲜
            if (panel.bottomSections.value.agentFiles) {
                const agentExpanded = agentFiles.expandedPaths()
                agentFiles.refresh()
                await agentFiles.loadPath(props.agentId, '')
                await Promise.all(agentExpanded.map(p => agentFiles.loadPath(props.agentId, p)))
            }
        } else {
            await git.loadRepos(props.agentId)
            let repo = panel.getRepoForAgent(props.agentId)
            if (!repo || !git.repos.value.find(r => r.path === repo)) {
                repo = git.repos.value[0]?.path ?? null
                if (repo) panel.setRepoForAgent(props.agentId, repo)
            }
            if (repo) {
                await Promise.all([
                    git.loadStatus(props.agentId, repo),
                    git.loadLog(props.agentId, repo),
                ])
            }
        }
    } finally {
        isRefreshing.value = false
    }
}
</script>

<template>
    <!-- 单根 contents wrapper：让外部 class（如 hidden lg:flex）能正确 fallthrough，
         同时不破坏父级 flex 布局——splitter 与 aside 仍直接是 flex item。
         移动端 (mobile=true) 在 daisyUI drawer-side 内嵌套：不需 splitter，宽度由 drawer 控制。 -->
    <div :class="mobile ? 'flex h-full w-full bg-base-100' : 'contents'">
        <!-- splitter：仅 PC 布局需要 -->
        <div v-if="!mobile" class="w-1 cursor-col-resize hover:bg-primary/40 transition-colors shrink-0"
            :class="{ 'bg-primary/40': isDragging }" @mousedown="onSplitterMouseDown" @dblclick="onSplitterDblClick" />

        <!-- panel -->
        <aside class="bg-base-100 flex flex-col shrink-0 overflow-hidden"
            :class="mobile ? 'flex-1 w-full' : 'border-l border-base-200'"
            :style="mobile ? undefined : { width: effectiveWidth + 'px' }">
            <!-- header: tabs + actions -->
            <div class="flex items-center justify-between border-b border-base-200 px-2 py-2 shrink-0">
                <div class="tabs tabs-sm">
                    <a class="tab tab-bordered gap-1" :class="{ 'tab-active': panel.activeTab.value === 'files' }"
                        @click="panel.setTab('files')">
                        <FolderIcon class="h-4 w-4" />
                        <span>{{ $t('workspace.tabFiles') }}</span>
                    </a>
                    <a class="tab tab-bordered gap-1" :class="{ 'tab-active': panel.activeTab.value === 'git' }"
                        @click="panel.setTab('git')">
                        <CodeBracketIcon class="h-4 w-4" />
                        <span>{{ $t('workspace.tabGit') }}</span>
                    </a>
                </div>
                <div class="flex items-center gap-0">
                    <button class="btn btn-ghost btn-xs btn-circle" :title="$t('common.refresh')"
                        :disabled="isRefreshing" @click="refresh">
                        <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': isRefreshing }" />
                    </button>
                    <button class="btn btn-ghost btn-xs btn-circle" :title="$t('common.close')" @click="panel.close()">
                        <XMarkIcon class="h-4 w-4" />
                    </button>
                </div>
            </div>

            <!-- content: tab 切换重新挂载组件，但数据在模块级单例中缓存，
                 子组件 onMounted 会检查缓存后决定是否重拉（spec §6.4 “不刷新”）。
                 不用 KeepAlive：避免跨 agent reset 后旧实例 reactivate 读到新 agent 数据交叉污染。
                 滑动管控下放到 tab 内部：history / agent-files 等顶底区需要在 tab 内加 sticky，
                 所以外层不能走 overflow-y-auto。 -->
            <div class="flex-1 min-h-0 overflow-hidden">
                <WorkspaceTabFiles v-if="panel.activeTab.value === 'files'" :key="'files-' + agentId"
                    :agent-id="agentId" />
                <WorkspaceTabGit v-else :key="'git-' + agentId" :agent-id="agentId" />
            </div>
        </aside>
    </div>
</template>
