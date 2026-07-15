<script setup lang="ts">
/**
 * Git Tab 容器（VSCode Source Control 风格）：
 * - 顶部：RepoSelector + Commit Bar（textarea 一行 + 提交按钮另起一行）
 * - 中部：Status (Changes / Staged / Untracked) — 每组 header 带分组级 actions，
 *         每行有 hover 行内按钮 (PC) / 始终可见 (mobile)，右键弹完整菜单
 * - 底部：可折叠 History 区
 */
import { onMounted, computed, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    PlusIcon, MinusIcon, CheckIcon,
    ArrowUturnLeftIcon, ArrowPathRoundedSquareIcon
} from '@heroicons/vue/24/outline'
import RepoSelector from './git/RepoSelector.vue'
import StatusGroup from './git/StatusGroup.vue'
import HistoryList from './git/HistoryList.vue'
import CollapsibleSection from './CollapsibleSection.vue'
import { useWorkspaceGit } from '../../composables/useWorkspaceGit'
import { useWorkspacePanel } from '../../composables/useWorkspacePanel'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'
import { useToast } from '../../composables/useToast'
import {
    buildGitFileMenuItems, buildGitInlineActions,
    runDiscardAllFlow, type GitGroup,
} from '../../composables/useGitFileActions'
import { buildAbsolutePath } from '../../composables/useFileActions'
import type { FileChange } from '../../composables/workspace-api'

const props = defineProps<{ agentId: string }>()
const git = useWorkspaceGit()
const panel = useWorkspacePanel()
const viewer = useWorkspaceViewer()
const toast = useToast()
const { t } = useI18n()

const selectedRepo = computed(() => panel.getRepoForAgent(props.agentId))

async function loadAll(repo: string) {
    await Promise.all([
        git.loadStatus(props.agentId, repo),
        git.loadLog(props.agentId, repo),
    ])
}

onMounted(async () => {
    // workspaceRoot 用于拼 git 文件的绝对路径（右键复制路径）；有缓存则跳过。
    void git.loadWorkspaceRoot(props.agentId)
    if (git.repos.value.length === 0 && !git.reposLoading.value) {
        await git.loadRepos(props.agentId)
    }
    let repo = selectedRepo.value
    if (!repo || !git.repos.value.find(r => r.path === repo)) {
        repo = git.repos.value[0]?.path ?? null
        if (repo) panel.setRepoForAgent(props.agentId, repo)
    }
    if (!repo) return
    const needStatus = !git.status.value || git.statusRepo !== repo
    const needLog = git.commits.value.length === 0 || git.commitsRepo !== repo
    if (needStatus || needLog) {
        await loadAll(repo)
    }
})

// 注意：viewer.close() 不再触发 status 重拉。真正会改动磁盘的入口
//   （WorkspaceFileView.save / stage / unstage / discard / commit）自己重拉。

function onPickRepo(repo: string) {
    panel.setRepoForAgent(props.agentId, repo)
    loadAll(repo)
}

function openDiff(group: GitGroup, change: FileChange) {
    const repo = selectedRepo.value
    if (!repo) return
    viewer.openDiff({ repo, mode: group, file: change.path })
}

/** 在 unstaged 与 untracked 合并后，单文件 diff 需要看 file.status 决定 mode：
 *  '?' → untracked（服务端走 git diff --no-index）；其余 → unstaged（git diff）。 */
function openUnstagedDiff(change: FileChange) {
    const repo = selectedRepo.value
    if (!repo) return
    const mode = change.status === '?' ? 'untracked' : 'unstaged'
    viewer.openDiff({ repo, mode, file: change.path })
}

/** 在 viewer 里打开"工作区当前文件"（VSCode 风格 Open File）。
 *  路径需要 workspace 相对路径：repoPath + '/' + entry.path。
 *  staged 模式 + deleted 状态：文件可能不在 worktree，调用方靠 disabledFor 屏蔽。 */
function openFile(change: FileChange) {
    const repo = selectedRepo.value
    if (!repo) return
    const wsRelPath = `${repo}/${change.path}`
    viewer.openFile(wsRelPath)
}

function openCommitDiff(args: { ref: string; file: string }) {
    const repo = selectedRepo.value
    if (!repo) return
    viewer.openDiff({ repo, mode: 'commit', ref: args.ref, file: args.file })
}

/** commit 文件行右键"打开文件"：打开工作区当前版本（workspace 相对路径 repo/file）。 */
function openCommitFile(file: string) {
    const repo = selectedRepo.value
    if (!repo) return
    viewer.openFile(`${repo}/${file}`)
}

const commitsCount = computed(() => git.commits.value.length || null)

// ── 合并 unstaged + untracked：VSCode 风格，"工作区改动" 包含 tracked 修改 + 未跟踪。
//    服务端仕然分两个数组（状态字符 ? vs M/A/D 区分）；UI 为合并显示。
const unstagedAndUntracked = computed<FileChange[]>(() => {
    const s = git.status.value
    if (!s) return []
    return [...s.unstaged, ...s.untracked]
})

// ── 共用：构造单行的 callback 集合（行内按钮和右键菜单都拿同一份） ──
function callbacksFor(group: GitGroup, change: FileChange) {
    const repo = selectedRepo.value
    return {
        file: change,
        group,
        // unstaged 组：diff 按 status 选 mode；staged 组依然走 staged mode。
        onOpenDiff: () => group === 'unstaged' ? openUnstagedDiff(change) : openDiff(group, change),
        onOpenFile: () => openFile(change),
        // 绝对路径 = workspaceRoot + repo + change.path；root 未就绪时退回相对路径。
        absolutePath: buildAbsolutePath(git.workspaceRoot.value, `${repo}/${change.path}`),
        // git 服务端会区分 tracked / untracked，这里一起传就行。
        onStage: group === 'unstaged' && repo
            ? () => git.stage(props.agentId, repo, [change.path])
            : undefined,
        onUnstage: group === 'staged' && repo
            ? () => git.unstage(props.agentId, repo, [change.path])
            : undefined,
        onDiscard: group === 'unstaged' && repo
            ? () => git.discard(props.agentId, repo, [change.path])
            : undefined,
    }
}

function buildItemsFor(group: GitGroup, change: FileChange) {
    const repo = selectedRepo.value
    if (!repo) return []
    return buildGitFileMenuItems(callbacksFor(group, change))
}

function buildInlineFor(group: GitGroup, change: FileChange) {
    const repo = selectedRepo.value
    if (!repo) return []
    return buildGitInlineActions(callbacksFor(group, change))
}

// ── 分组级动作（stage all / unstage all / discard all） ──
async function onStageAllChanges() {
    const repo = selectedRepo.value
    const files = unstagedAndUntracked.value.map(c => c.path)
    if (!repo || files.length === 0) return
    try { await git.stage(props.agentId, repo, files) }
    catch (e: any) { toast.error(`${t('workspace.git.stage')}: ${e?.message || e}`) }
}

async function onUnstageAll() {
    const repo = selectedRepo.value
    const status = git.status.value
    if (!repo || !status || status.staged.length === 0) return
    try { await git.unstage(props.agentId, repo) /* all */ }
    catch (e: any) { toast.error(`${t('workspace.git.unstage')}: ${e?.message || e}`) }
}

async function onDiscardAllChanges() {
    const repo = selectedRepo.value
    const list = unstagedAndUntracked.value
    if (!repo || list.length === 0) return
    // 文案划分：全是 untracked 走删除文案提示，其他走「丢弃修改」提示。
    // 混合场景仍走「丢弃修改」（不会误导：该提示不说 untracked 会被保留）。
    const allUntracked = list.every(c => c.status === '?')
    await runDiscardAllFlow({
        count: list.length,
        kind: allUntracked ? 'untracked' : 'mixed',
        // 服务端内部会逐个分辨 tracked / untracked 走不同逻辑。
        onConfirmed: () => git.discard(props.agentId, repo, list.map(c => c.path)),
    })
}

// ── Commit bar ──
const commitMessage = computed({
    get: () => selectedRepo.value ? git.getCommitMessage(selectedRepo.value) : '',
    set: (v: string) => { if (selectedRepo.value) git.setCommitMessage(selectedRepo.value, v) },
})
const stagedCount = computed(() => git.status.value?.staged.length ?? 0)
const aheadCount = computed(() => git.status.value?.ahead ?? 0)
const behindCount = computed(() => git.status.value?.behind ?? 0)
const canCommit = computed(() => {
    if (git.mutating.value) return false
    if (!selectedRepo.value) return false
    if (commitMessage.value.trim().length === 0) return false
    return stagedCount.value > 0
})

/** 主按钮三态：暂存有文件→提交；暂存空且有未推送提交→同步；其余禁用。 */
const primaryMode = computed<'commit' | 'sync' | 'disabled'>(() => {
    if (stagedCount.value > 0) return 'commit'
    if (aheadCount.value > 0) return 'sync'
    return 'disabled'
})

/** 主按钮是否可点：commit 模式需 message 非空；sync 模式只需非 mutating。 */
const canPrimary = computed(() => {
    if (git.mutating.value) return false
    if (!selectedRepo.value) return false
    if (primaryMode.value === 'disabled') return false
    if (primaryMode.value === 'commit' && commitMessage.value.trim().length === 0) return false
    return true
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)

async function onCommit() {
    const repo = selectedRepo.value
    if (!repo) return
    if (!canCommit.value) return
    const msg = commitMessage.value
    try {
        const r = await git.commit(props.agentId, repo, msg)
        toast.success(t('workspace.git.committed', { sha: r.head?.slice(0, 7) ?? '' }))
        await nextTick()
        textareaRef.value?.focus()
    } catch (e: any) {
        toast.error(`${t('workspace.git.commit')}: ${e?.message || e}`)
    }
}

function onCommitKeydown(e: KeyboardEvent) {
    // VSCode: Ctrl/Cmd+Enter 提交
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onCommit()
    }
}

// ── Sync ──
const syncing = ref(false)

async function onSync() {
    const repo = selectedRepo.value
    if (!repo || git.mutating.value) return
    syncing.value = true
    try {
        const r = await git.sync(props.agentId, repo)
        toast.success(r.pushed ? t('workspace.git.syncedPushed') : t('workspace.git.synced'))
    } catch (e: any) {
        toast.error(`${t('workspace.git.sync')}: ${e?.message || e}`)
    } finally {
        syncing.value = false
    }
}

/** 主按钮点击：按当前模式分流到提交或同步。 */
async function onPrimary() {
    if (primaryMode.value === 'commit') {
        await onCommit()
    } else if (primaryMode.value === 'sync') {
        await onSync()
    }
}
</script>

<template>
    <div class="flex flex-col h-full">
        <!-- 顶部：RepoSelector + Commit Bar — flex-1 内部滚动 -->
        <div class="flex-1 min-h-0 overflow-y-auto">
            <RepoSelector :selected-repo="selectedRepo" @select="onPickRepo" />

            <!-- Commit bar：消息 textarea 在上，提交按钮另起一行 — VSCode 风格 -->
            <div v-if="selectedRepo" class="px-2 pt-2 pb-1 border-b border-base-200">
                <textarea ref="textareaRef" v-model="commitMessage" rows="2"
                    class="textarea textarea-bordered textarea-xs w-full min-h-[2.5rem] resize-y leading-snug font-mono"
                    :aria-label="$t('workspace.git.messagePlaceholder')"
                    :placeholder="$t('workspace.git.messagePlaceholder')" :disabled="git.mutating.value"
                    @keydown="onCommitKeydown" />
                <div class="flex gap-1 mt-1">
                    <button type="button" class="btn btn-primary btn-sm flex-1 gap-1"
                        :class="{ 'btn-disabled': !canPrimary }" :disabled="!canPrimary"
                        :title="primaryMode === 'sync' ? $t('workspace.git.syncTip') : $t('workspace.git.commitTip')"
                        @click="onPrimary">
                        <template v-if="primaryMode === 'commit'">
                            <CheckIcon class="h-4 w-4" />
                            <span>
                                {{ $t('workspace.git.commit') }}
                                <span class="opacity-70">({{ stagedCount }})</span>
                            </span>
                        </template>
                        <template v-else-if="primaryMode === 'sync'">
                            <ArrowPathRoundedSquareIcon class="h-4 w-4" :class="{ 'animate-spin': syncing }" />
                            <span>{{ $t('workspace.git.syncChanges') }} {{ aheadCount }}↑</span>
                        </template>
                        <template v-else>
                            <CheckIcon class="h-4 w-4" />
                            <span>{{ $t('workspace.git.commit') }}</span>
                        </template>
                    </button>
                    <button type="button" class="btn   btn-sm px-2 gap-1"
                        :class="{ 'btn-disabled': git.mutating.value || !selectedRepo }"
                        :disabled="git.mutating.value || !selectedRepo"
                        :title="$t('workspace.git.syncTip')" @click="onSync">
                        <ArrowPathRoundedSquareIcon class="h-4 w-4" :class="{ 'animate-spin': syncing }" />
                        <span v-if="behindCount > 0 || aheadCount > 0" class="text-xs font-mono leading-none">
                            <span v-if="behindCount > 0">↓{{ behindCount }}</span><span v-if="behindCount > 0 && aheadCount > 0"> </span><span v-if="aheadCount > 0">↑{{ aheadCount }}</span>
                        </span>
                    </button>
                </div>
            </div>

            <div v-if="git.statusLoading.value && !git.status.value" class="px-3 py-2 text-xs text-base-content/50">
                <span class="loading loading-spinner loading-xs mr-2" />{{ $t('common.loading') }}
            </div>
            <div v-else-if="git.statusError.value" class="px-3 py-2 text-xs text-error">
                {{ git.statusError.value }}
            </div>
            <template v-else-if="git.status.value">
                <!-- Staged 在最上面（VSCode 顺序：暂存区 → 工作区改动 → 未跟踪）。
                     unstage all。受控展开状态 跳出到 panel.statusGroups。 -->
                <StatusGroup :title="$t('workspace.staged')" :changes="git.status.value.staged"
                    :open="panel.statusGroups.value.staged"
                    :on-click="(c) => openDiff('staged', c)"
                    :build-items="(c) => buildItemsFor('staged', c)"
                    :build-inline-actions="(c) => buildInlineFor('staged', c)"
                    @toggle="(o: boolean) => panel.setStatusGroup('staged', o)">
                    <template #actions>
                        <button type="button" class="btn btn-ghost btn-xs btn-square"
                            :disabled="git.mutating.value" :aria-label="$t('workspace.git.unstageAll')"
                            :title="$t('workspace.git.unstageAll')" @click="onUnstageAll">
                            <MinusIcon class="h-3.5 w-3.5" />
                        </button>
                    </template>
                </StatusGroup>
                <!-- Changes：合并 unstaged + untracked（VSCode 风格），始终显示。
                     discard all (撤销/删) / stage all。 -->
                <StatusGroup :title="$t('workspace.changes')" :changes="unstagedAndUntracked"
                    :always-show="true"
                    :open="panel.statusGroups.value.unstaged"
                    :on-click="openUnstagedDiff"
                    :build-items="(c) => buildItemsFor('unstaged', c)"
                    :build-inline-actions="(c) => buildInlineFor('unstaged', c)"
                    @toggle="(o: boolean) => panel.setStatusGroup('unstaged', o)">
                    <template #actions>
                        <button type="button" class="btn btn-ghost btn-xs btn-square"
                            :disabled="git.mutating.value || unstagedAndUntracked.length === 0"
                            :aria-label="$t('workspace.git.discardAll')"
                            :title="$t('workspace.git.discardAll')" @click="onDiscardAllChanges">
                            <ArrowUturnLeftIcon class="h-3.5 w-3.5" />
                        </button>
                        <button type="button" class="btn btn-ghost btn-xs btn-square"
                            :disabled="git.mutating.value || unstagedAndUntracked.length === 0"
                            :aria-label="$t('workspace.git.stageAll')"
                            :title="$t('workspace.git.stageAll')" @click="onStageAllChanges">
                            <PlusIcon class="h-3.5 w-3.5" />
                        </button>
                    </template>
                </StatusGroup>
                <div v-if="!git.status.value.staged.length && unstagedAndUntracked.length === 0"
                    class="px-3 py-3 text-xs text-base-content/50">
                    {{ $t('workspace.workingTreeClean') }}
                </div>
            </template>
        </div>

        <!-- 底部：History 折叠区 -->
        <CollapsibleSection v-if="selectedRepo" :title="$t('workspace.history')"
            :open="panel.bottomSections.value.history" :count="commitsCount"
            @toggle="(o: boolean) => panel.setBottomSection('history', o)">
            <HistoryList :agent-id="agentId" :repo="selectedRepo" :on-open-diff="openCommitDiff"
                :on-open-file="openCommitFile" />
        </CollapsibleSection>
    </div>
</template>
