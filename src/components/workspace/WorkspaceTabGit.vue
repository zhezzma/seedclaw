<script setup lang="ts">
/**
 * Git Tab 容器（VSCode 风格上下分块）：
 * - 顶部：RepoSelector + Status (Changes / Staged / Untracked) — flex-1 + 内部滚动
 * - 底部：可折叠 History 区，固定高度内部滚动；点击 commit 展开 file 列表打开 diff
 *
 * - 加载 repos → 选择当前仓库（沿用 panel 持久化偏好；找不到则回退第一个）
 * - 加载选中仓库的 status + log
 * - 把 status 行 / commit 文件的点击转成 viewer.openDiff
 */
import { onMounted, computed, watch } from 'vue'
import RepoSelector from './git/RepoSelector.vue'
import StatusGroup from './git/StatusGroup.vue'
import HistoryList from './git/HistoryList.vue'
import CollapsibleSection from './CollapsibleSection.vue'
import { useWorkspaceGit } from '../../composables/useWorkspaceGit'
import { useWorkspacePanel } from '../../composables/useWorkspacePanel'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'
import type { FileChange } from '../../composables/workspace-api'

const props = defineProps<{ agentId: string }>()
const git = useWorkspaceGit()
const panel = useWorkspacePanel()
const viewer = useWorkspaceViewer()

const selectedRepo = computed(() => panel.getRepoForAgent(props.agentId))

async function loadAll(repo: string) {
    await Promise.all([
        git.loadStatus(props.agentId, repo),
        git.loadLog(props.agentId, repo),
    ])
}

onMounted(async () => {
    // 缓存命中指当前 agent 的 repos 已在全局单例中（同 agent tab 切回场景）。
    // 跨 agent 切换时 WorkspacePanel watch 会先调 git.reset()，这里会重新拉。
    if (git.repos.value.length === 0 && !git.reposLoading.value) {
        await git.loadRepos(props.agentId)
    }
    let repo = selectedRepo.value
    // 如果记忆的 repo 不在当前 repos 列表中，回退到第一个
    if (!repo || !git.repos.value.find(r => r.path === repo)) {
        repo = git.repos.value[0]?.path ?? null
        if (repo) panel.setRepoForAgent(props.agentId, repo)
    }
    if (!repo) return
    // 仅在 status / log 未加载过或仓库已切换时重拉。
    // git.statusRepo / git.commitsRepo 是底层 reactive state 直接暴露的字段。
    const needStatus = !git.status.value || git.statusRepo !== repo
    const needLog = git.commits.value.length === 0 || git.commitsRepo !== repo
    if (needStatus || needLog) {
        await loadAll(repo)
    }
})

// 响应 markStatusStale：viewer.close() 后会把 git.statusRepo 置 null，
// 这里 watch 检测到后重拉 status（spec §6.4：Viewer 关闭后仅刷新 status）。
// 不能靠 onMounted——WorkspaceTabGit 在 viewer 开/关期间不卸载，onMounted 只跑一次。
watch(
    [() => git.statusRepo, selectedRepo],
    ([statusRepo, repo]) => {
        if (statusRepo === null && repo && !git.statusLoading.value) {
            git.loadStatus(props.agentId, repo)
        }
    },
)

function onPickRepo(repo: string) {
    panel.setRepoForAgent(props.agentId, repo)
    loadAll(repo)
}

function openDiff(group: 'unstaged' | 'staged' | 'untracked', change: FileChange) {
    const repo = selectedRepo.value
    if (!repo) return
    viewer.openDiff({ repo, mode: group, file: change.path })
}

function openCommitDiff(args: { ref: string; file: string }) {
    const repo = selectedRepo.value
    if (!repo) return
    viewer.openDiff({ repo, mode: 'commit', ref: args.ref, file: args.file })
}

const commitsCount = computed(() => git.commits.value.length || null)
</script>

<template>
    <div class="flex flex-col h-full">
        <!-- 顶部：RepoSelector + 三组 status — flex-1 内部滚动 -->
        <div class="flex-1 min-h-0 overflow-y-auto">
            <RepoSelector :selected-repo="selectedRepo" @select="onPickRepo" />

            <div v-if="git.statusLoading.value && !git.status.value" class="px-3 py-2 text-xs text-base-content/50">
                <span class="loading loading-spinner loading-xs mr-2" />{{ $t('common.loading') }}
            </div>
            <div v-else-if="git.statusError.value" class="px-3 py-2 text-xs text-error">
                {{ git.statusError.value }}
            </div>
            <template v-else-if="git.status.value">
                <StatusGroup :title="$t('workspace.changes')" :changes="git.status.value.unstaged"
                    :on-click="(c) => openDiff('unstaged', c)" />
                <StatusGroup :title="$t('workspace.staged')" :changes="git.status.value.staged"
                    :on-click="(c) => openDiff('staged', c)" />
                <StatusGroup :title="$t('workspace.untracked')" :changes="git.status.value.untracked"
                    :default-open="false" :on-click="(c) => openDiff('untracked', c)" />
                <div v-if="!git.status.value.staged.length && !git.status.value.unstaged.length && !git.status.value.untracked.length"
                    class="px-3 py-3 text-xs text-base-content/50">
                    {{ $t('workspace.workingTreeClean') }}
                </div>
            </template>
        </div>

        <!-- 底部：History 折叠区 — 固定高度 + 内部滚动 -->
        <CollapsibleSection v-if="selectedRepo" :title="$t('workspace.history')"
            :open="panel.bottomSections.value.history" :count="commitsCount"
            @toggle="(o: boolean) => panel.setBottomSection('history', o)">
            <HistoryList :agent-id="agentId" :repo="selectedRepo" :on-open-diff="openCommitDiff" />
        </CollapsibleSection>
    </div>
</template>
