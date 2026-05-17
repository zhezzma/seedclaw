<script setup lang="ts">
/**
 * Files Tab：以 workspace 根为树根的懒加载目录树。
 *
 * 点击文件 → 进入 Viewer 模式（替换聊天区显示文件内容）。
 * 点击 git 仓库徽章 → 切到 Git tab 并选中此仓库。
 */
import { onMounted, computed } from 'vue'
import { useWorkspaceTree } from '../../composables/useWorkspaceTree'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'
import { useWorkspacePanel } from '../../composables/useWorkspacePanel'
import { useToast } from '../../composables/useToast'
import { useI18n } from 'vue-i18n'
import type { TreeEntry } from '../../composables/workspace-api'
import FileTreeNode from './FileTreeNode.vue'

const props = defineProps<{ agentId: string }>()
const tree = useWorkspaceTree()
const viewer = useWorkspaceViewer()
const panel = useWorkspacePanel()
const toast = useToast()
const { t } = useI18n()

onMounted(() => {
    tree.loadPath(props.agentId, '')
})

function onClickEntry(entry: TreeEntry) {
    if (entry.type === 'symlink') {
        toast.warning(t('workspace.symlinkBlocked'))
        return
    }
    if (entry.type === 'dir') {
        tree.toggleExpand(entry.path)
        if (tree.isExpanded(entry.path)) {
            tree.loadPath(props.agentId, entry.path)
        }
    } else {
        // file → viewer：使用相对 workspace 的 path 拼绝对路径
        const root = tree.entriesAt('')?.root || ''
        const abs = root ? `${root}/${entry.path}` : entry.path
        viewer.openFile(abs)
    }
}

function onClickRepoBadge(entry: TreeEntry) {
    panel.setTab('git')
    panel.setRepoForAgent(props.agentId, entry.path)
}

const rootResult = computed(() => tree.entriesAt(''))
</script>

<template>
    <div class="text-sm">
        <div v-if="tree.isLoading('')" class="p-3 text-base-content/60">
            <span class="loading loading-spinner loading-xs mr-2" />{{ $t('common.loading') }}
        </div>
        <div v-else-if="tree.errorAt('')" class="p-3 text-error text-xs">
            {{ tree.errorAt('') }}
        </div>
        <div v-else-if="rootResult">
            <FileTreeNode v-for="entry in rootResult.entries" :key="entry.path" :entry="entry" :agent-id="agentId"
                :on-click="onClickEntry" :on-click-repo-badge="onClickRepoBadge" :depth="0" />
            <div v-if="rootResult.truncated" class="px-3 py-2 text-xs text-warning">
                ⚠ {{ $t('workspace.truncated') }}
            </div>
        </div>
    </div>
</template>
