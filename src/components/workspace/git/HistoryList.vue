<script setup lang="ts">
/**
 * 提交历史列表：
 * - 默认加载 50 条
 * - 点击 commit 行 → 就地展开列出此 commit 改动的文件，再点击文件打开 diff
 * - 底部 "load more" 翻页
 */
import { ref } from 'vue'
import {
    ChevronDownIcon, ChevronRightIcon, DocumentIcon,
} from '@heroicons/vue/24/outline'
import { useWorkspaceGit } from '../../../composables/useWorkspaceGit'

const props = defineProps<{
    agentId: string
    repo: string
    onOpenDiff: (args: { ref: string; file: string }) => void
}>()

const git = useWorkspaceGit()
const expanded = ref<Record<string, boolean>>({})

async function toggleCommit(sha: string) {
    expanded.value[sha] = !expanded.value[sha]
    if (expanded.value[sha] && !git.commitFiles.value[sha]) {
        await git.loadCommitFiles(props.agentId, props.repo, sha)
    }
}

/** 简单的相对时间显示（秒/分/时/天）；不引入额外依赖 */
function relativeTime(iso: string): string {
    const t = new Date(iso).getTime()
    if (isNaN(t)) return iso
    const diff = (Date.now() - t) / 1000
    if (diff < 60) return Math.floor(diff) + 's ago'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    return Math.floor(diff / 86400) + 'd ago'
}
</script>

<template>
    <div class="text-xs">
        <div class="px-2 py-1 font-medium border-b border-base-200">
            {{ $t('workspace.history') }}
        </div>
        <div v-if="git.commitsLoading.value && git.commits.value.length === 0"
            class="px-3 py-2 text-base-content/50">
            <span class="loading loading-spinner loading-xs" />
        </div>
        <div v-else-if="git.commitsError.value" class="px-3 py-2 text-error">
            {{ git.commitsError.value }}
        </div>
        <template v-else>
            <div v-for="commit in git.commits.value" :key="commit.sha">
                <button class="flex items-center gap-2 w-full text-left px-2 py-1 hover:bg-base-200"
                    :title="commit.subject" @click="toggleCommit(commit.sha)">
                    <ChevronDownIcon v-if="expanded[commit.sha]" class="h-3 w-3 shrink-0" />
                    <ChevronRightIcon v-else class="h-3 w-3 shrink-0" />
                    <span class="font-mono text-base-content/60">●</span>
                    <span class="font-mono text-base-content/60 shrink-0">{{ commit.shortSha }}</span>
                    <span class="truncate flex-1">{{ commit.subject }}</span>
                    <span class="text-base-content/40 shrink-0">{{ relativeTime(commit.authorDate) }}</span>
                </button>
                <div v-if="expanded[commit.sha]" class="pl-8 pb-1">
                    <div v-if="git.isCommitFilesLoading(commit.sha)" class="text-base-content/40">
                        <span class="loading loading-spinner loading-xs" />
                    </div>
                    <button v-for="f in git.commitFiles.value[commit.sha] || []" :key="f.path"
                        class="flex items-center gap-2 w-full text-left px-2 py-0.5 hover:bg-base-200 font-mono"
                        @click="onOpenDiff({ ref: commit.sha, file: f.path })">
                        <DocumentIcon class="h-3 w-3 shrink-0 text-base-content/40" />
                        <span class="truncate">{{ f.path }}</span>
                    </button>
                </div>
            </div>
            <button v-if="git.commitsHasMore.value"
                class="w-full text-center px-2 py-1 text-base-content/60 hover:bg-base-200"
                :disabled="git.commitsLoading.value" @click="git.loadMoreLog(agentId, repo)">
                {{ git.commitsLoading.value ? $t('common.loading') : $t('workspace.loadMore') }}
            </button>
        </template>
    </div>
</template>
