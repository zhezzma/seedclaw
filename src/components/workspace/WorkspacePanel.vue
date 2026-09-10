<script setup lang="ts">
/**
 * Workspace Panel 外壳：
 * - 提供 tab 切换 (Files / Git)，子组件用 :key=agentId 跨 agent 强制 remount
 * - 左侧 splitter 拖动调整宽度（240～600）；拖动时用本地 ref 实时刷新视觉，
 *   仅 mouseup 时一次性 persist 到 settings store，避免每像素一次 localStorage 写
 * - 顶部刷新按钮真正重拉数据（清缓存 + 立即 reload）
 * - Agent 切换时通过 ensureAgent 守护各 store 归属（条件 reset，同 agent 重挂不清 cache）
 *
 * 模板用单根 `<div class="contents">` 包裹 splitter + aside：Vue 3 多根 SFC 不会
 * fallthrough class 到子节点，外部传入的 `class="hidden lg:flex"` 会静默丢失。
 * `display:contents` 让 wrapper 不参与布局，splitter 与 aside 仍是父 flex 的 item。
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { XMarkIcon, ArrowPathIcon, FolderIcon, CodeBracketIcon } from '@heroicons/vue/24/outline'
import { useWorkspacePanel, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH } from '../../composables/useWorkspacePanel'
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
// 数据所有权显式化：三个 store 各自记录 currentAgentId，调用 ensureAgent(id) 在跨 agent 访问
// 时主动 reset，不依赖 watch immediate / 其它实例。——这是唯一的清理路径。
//
// setup 同步调用：在子组件（:key=agentId）创建之前完成，子组件 onMounted 看到的总是属于
// 当前 agent 的 cache。这覆盖了“panel 关闭期间切 agent 后重开”场景（watch 未在场不会触发）。
tree.ensureAgent(props.agentId)
git.ensureAgent(props.agentId)
agentFiles.ensureAgent(props.agentId)

// agent 切换（panel 仍挂载）时走同一路径。flush:'pre' 让 ensureAgent 在子组件 :key 驱动的
// remount 之前完成，避免新组件 onMounted 拉的数据被随后的 reset 清掉。
watch(() => props.agentId, (id) => {
    tree.ensureAgent(id)
    git.ensureAgent(id)
    agentFiles.ensureAgent(id)
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
    return Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, Math.round(w)))
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
// isRefreshing 守卫：避免连点高频重复请求
const isRefreshing = ref(false)
async function refresh() {
    if (isRefreshing.value) return
    isRefreshing.value = true
    // agent 快照：await 期间切 agent 的话，旧 agent 的展开路径/仓库选择
    // 不能打到已归属新 agent 的 store 上（loadPath 有归属守护，这里提前止损）。
    const agentId = props.agentId
    try {
        if (panel.activeTab.value === 'files') {
            const expandedPaths = tree.expandedPaths()
            tree.refresh()
            await tree.loadPath(agentId, '')
            if (props.agentId !== agentId) return
            await Promise.all(expandedPaths.map(p => tree.loadPath(agentId, p)))
            // 树重展开期间也可能切 agent：agentFiles 已被 ensureAgent(reset) 归属
            // 新 agent，新 tab（:key 重挂）的 immediate watch 已同步建好在飞占位；
            // 此时继续走 agentFiles.refresh() 会把新 agent 的占位无条件清掉，而
            // 下面的 loadPath(旧 agent) 被归属守护 no-op，无人重拉 → Agent Files
            // 区卡死空白（isLoading/error/entries 全空，模板三连 v-if 全不命中），
            // 直到手动收起/展开或再点刷新。
            if (props.agentId !== agentId) return
            // 底部 agent 文件区只在展开时才重拉，避免隐式快照过鲜
            if (panel.bottomSections.value.agentFiles) {
                const agentExpanded = agentFiles.expandedPaths()
                agentFiles.refresh()
                await agentFiles.loadPath(agentId, '')
                await Promise.all(agentExpanded.map(p => agentFiles.loadPath(agentId, p)))
            }
        } else {
            await git.loadRepos(agentId)
            if (props.agentId !== agentId) return
            let repo = panel.getRepoForAgent(agentId)
            // 只在没有选择时回退 repos[0]；显式选过的仓库即使不在列表（嵌套仓库）
            // 也保留 —— 与 WorkspaceTabGit.onMounted 同语义。
            if (!repo) {
                repo = git.repos.value[0]?.path ?? null
                if (repo) panel.setRepoForAgent(agentId, repo)
            }
            if (repo) {
                await Promise.all([
                    // 手动刷新显式带 refresh=1：服务端先 git fetch 刷 upstream，
                    // 否则 ↓behind 永远基于本地过期的 remote-tracking ref。
                    git.loadStatus(agentId, repo, { refresh: true }),
                    git.loadLog(agentId, repo),
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
