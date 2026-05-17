<script setup lang="ts">
/**
 * Git Tab 顶部的仓库选择器：sticky 顶栏 + 下拉。
 *
 * 显示当前选中仓库的 branch / dirty / ahead / behind 摘要；
 * 点击下拉选择别的仓库，错误仓库灰色降级 + tooltip 显示原因。
 */
import { ref, computed } from 'vue'
import {
    ChevronDownIcon, ExclamationTriangleIcon, CheckIcon,
} from '@heroicons/vue/24/outline'
import { useWorkspaceGit } from '../../../composables/useWorkspaceGit'

const props = defineProps<{ selectedRepo: string | null }>()
const emit = defineEmits<{ (e: 'select', repo: string): void }>()
const git = useWorkspaceGit()

const open = ref(false)
const current = computed(() =>
    git.repos.value.find(r => r.path === props.selectedRepo) || null,
)

function onPick(repo: string) {
    open.value = false
    emit('select', repo)
}
</script>

<template>
    <div class="relative px-2 py-2 border-b border-base-200 bg-base-100 sticky top-0 z-10">
        <button class="flex items-center gap-2 w-full text-left text-sm hover:bg-base-200 rounded px-2 py-1"
            :title="current?.path" @click="open = !open">
            <span class="font-mono text-xs">⎇</span>
            <span class="font-medium truncate flex-1">
                {{ current?.name || $t('workspace.noRepoSelected') }}
            </span>
            <span v-if="current && current.branch" class="text-xs text-base-content/70">
                {{ current.branch }}
            </span>
            <span v-if="current && current.dirty > 0" class="badge badge-xs badge-warning">●{{ current.dirty }}</span>
            <span v-if="current && current.ahead > 0" class="text-xs text-info">↑{{ current.ahead }}</span>
            <span v-if="current && current.behind > 0" class="text-xs text-info">↓{{ current.behind }}</span>
            <ChevronDownIcon class="h-3.5 w-3.5 text-base-content/50" />
        </button>

        <div v-if="open"
            class="absolute left-2 right-2 mt-1 bg-base-100 border border-base-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-20">
            <button v-for="repo in git.repos.value" :key="repo.path"
                class="flex items-center gap-2 w-full text-left text-sm hover:bg-base-200 px-3 py-1.5"
                :class="{ 'bg-base-200': props.selectedRepo === repo.path }" @click="onPick(repo.path)">
                <ExclamationTriangleIcon v-if="repo.error" class="h-3.5 w-3.5 text-warning shrink-0" :title="repo.error" />
                <span v-else class="font-mono text-xs">⎇</span>
                <span class="truncate flex-1" :class="repo.error ? 'text-base-content/40' : ''">{{ repo.name }}</span>
                <span v-if="repo.branch" class="text-xs text-base-content/60">{{ repo.branch }}</span>
                <span v-if="repo.dirty > 0" class="badge badge-xs badge-warning">●{{ repo.dirty }}</span>
                <CheckIcon v-if="props.selectedRepo === repo.path" class="h-3.5 w-3.5" />
            </button>
            <div v-if="git.repos.value.length === 0" class="px-3 py-2 text-xs text-base-content/50">
                {{ $t('workspace.noRepos') }}
            </div>
        </div>
    </div>
</template>
