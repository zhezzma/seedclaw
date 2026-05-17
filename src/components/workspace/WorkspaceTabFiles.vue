<script setup lang="ts">
/**
 * Files Tab：以 workspace 根为树根的懒加载目录树。
 *
 * 布局（VSCode 风格）：
 * - 主区：workspace 目录树，flex-1 + 内部滚动
 * - 底部：可折叠 "Agent Files" 区，固定高度内部滚动；展示 paths.agentDir 下的配置文件
 *
 * 点击文件 → 进入 Viewer 模式（替换聊天主区）。
 * 点击 git 仓库徽章 → 切到 Git tab 并选中此仓库。
 */
import { onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceTree } from '../../composables/useWorkspaceTree'
import { useAgentFiles } from '../../composables/useAgentFiles'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'
import { useWorkspacePanel } from '../../composables/useWorkspacePanel'
import { useToast } from '../../composables/useToast'
import { useConfirm } from '../../composables/useConfirm'
import type { TreeEntry } from '../../composables/workspace-api'
import FileTreeNode from './FileTreeNode.vue'
import AgentFileTreeNode from './AgentFileTreeNode.vue'
import CollapsibleSection from './CollapsibleSection.vue'

const props = defineProps<{ agentId: string }>()
const tree = useWorkspaceTree()
const agentFiles = useAgentFiles()
const viewer = useWorkspaceViewer()
const panel = useWorkspacePanel()
const toast = useToast()
const { confirm } = useConfirm()
const { t } = useI18n()

onMounted(() => {
    tree.loadPath(props.agentId, '')
})

// 折叠区展开时按需懒加载 agent 配置目录根（spec: 默认折叠避免无意义请求）
watch(
    () => panel.bottomSections.value.agentFiles,
    (open) => {
        if (open && !agentFiles.entriesAt('') && !agentFiles.isLoading('')) {
            agentFiles.loadPath(props.agentId, '')
        }
    },
    { immediate: true },
)

/** 切文件前统一拦截：仅在 viewer 为该文件有未保存改动时拦 confirm。 */
async function confirmIfDirty(): Promise<boolean> {
    if (!viewer.dirty.value) return true
    return await confirm(t('workspace.unsavedChanges'), t('common.confirm'))
}

async function onClickEntry(entry: TreeEntry) {
    if (entry.type === 'symlink') {
        toast.warning(t('workspace.symlinkBlocked'))
        return
    }
    if (entry.type === 'dir') {
        tree.toggleExpand(entry.path)
        if (tree.isExpanded(entry.path)) {
            tree.loadPath(props.agentId, entry.path)
        }
        return
    }
    // file → viewer：切文件前询问丢弃（WorkspaceViewer.close 只拦 back/Esc，这里补充 tree 路径）。
    // 传递相对 workspace 路径，后端 agent-scoped /file 接口 resolveSafe 负责拼绝对路径。
    if (!await confirmIfDirty()) return
    viewer.openFile(entry.path)
}

function onClickRepoBadge(entry: TreeEntry) {
    panel.setTab('git')
    panel.setRepoForAgent(props.agentId, entry.path)
}

async function onClickAgentEntry(entry: TreeEntry) {
    if (entry.type === 'symlink') {
        toast.warning(t('workspace.symlinkBlocked'))
        return
    }
    if (entry.type === 'dir') {
        agentFiles.toggleExpand(entry.path)
        if (agentFiles.isExpanded(entry.path)) {
            agentFiles.loadPath(props.agentId, entry.path)
        }
        return
    }
    if (!await confirmIfDirty()) return
    viewer.openAgentFile(entry.path)
}

const rootResult = computed(() => tree.entriesAt(''))
const agentRootResult = computed(() => agentFiles.entriesAt(''))
const agentFilesCount = computed(() => agentRootResult.value?.entries.length ?? null)
</script>

<template>
    <div class="flex flex-col h-full text-sm">
        <!-- 主区：workspace 目录树（flex-1 + 内部滚动） -->
        <div class="flex-1 min-h-0 overflow-y-auto">
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

        <!-- 底部：Agent 配置目录折叠区 -->
        <CollapsibleSection :title="$t('workspace.agentFiles')"
            :open="panel.bottomSections.value.agentFiles" :count="agentFilesCount"
            @toggle="(o: boolean) => panel.setBottomSection('agentFiles', o)">
            <div v-if="agentFiles.isLoading('')" class="p-3 text-base-content/60">
                <span class="loading loading-spinner loading-xs mr-2" />{{ $t('common.loading') }}
            </div>
            <div v-else-if="agentFiles.errorAt('')" class="p-3 text-error text-xs">
                {{ agentFiles.errorAt('') }}
            </div>
            <div v-else-if="agentRootResult">
                <AgentFileTreeNode v-for="entry in agentRootResult.entries" :key="entry.path" :entry="entry"
                    :agent-id="agentId" :on-click="onClickAgentEntry" :depth="0" />
                <div v-if="agentRootResult.truncated" class="px-3 py-2 text-xs text-warning">
                    ⚠ {{ $t('workspace.truncated') }}
                </div>
                <div v-else-if="agentRootResult.entries.length === 0"
                    class="px-3 py-2 text-xs text-base-content/40">
                    {{ $t('workspace.noAgentFiles') }}
                </div>
            </div>
        </CollapsibleSection>
    </div>
</template>
