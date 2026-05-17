<script setup lang="ts">
/**
 * Agent 配置目录的递归节点。FileTreeNode 的精简版：
 * - 不显示 git 徽章（agent 配置目录不会嵌套 git 仓库）
 * - 走 useAgentFiles composable 而非 useWorkspaceTree
 * - scope=agent 进入 buildFileMenuItems：菜单的 @引用 用 `@agent:` 前缀
 *
 * 通过 defineOptions({ name }) 显式声明组件名以支持模板自引用。
 */
import { computed } from 'vue'
import {
    ChevronRightIcon, ChevronDownIcon,
    FolderIcon, DocumentIcon, LinkIcon,
    EllipsisVerticalIcon,
} from '@heroicons/vue/24/outline'
import { useAgentFiles } from '../../composables/useAgentFiles'
import { useContextMenu } from '../../composables/useContextMenu'
import { buildFileMenuItems } from '../../composables/useFileActions'
import type { TreeEntry } from '../../composables/workspace-api'

defineOptions({ name: 'AgentFileTreeNode' })

const props = defineProps<{
    entry: TreeEntry
    agentId: string
    onClick: (entry: TreeEntry) => void
    depth?: number
}>()

const tree = useAgentFiles()
const ctxMenu = useContextMenu()
const expanded = computed(() => tree.isExpanded(props.entry.path))
const children = computed(() => tree.entriesAt(props.entry.path)?.entries || [])
const isLoadingChildren = computed(() => tree.isLoading(props.entry.path))

const padding = computed(() => `${(props.depth ?? 0) * 12 + 8}px`)
const childPadding = computed(() => `${((props.depth ?? 0) + 1) * 12 + 8}px`)

function onRowContextMenu(e: MouseEvent) {
    e.preventDefault()
    ctxMenu.openAt(
        buildFileMenuItems({ agentId: props.agentId, entry: props.entry, scope: 'agent' }),
        { x: e.clientX, y: e.clientY },
    )
}

function onKebabClick(e: MouseEvent) {
    e.stopPropagation()
    ctxMenu.openAtElement(
        buildFileMenuItems({ agentId: props.agentId, entry: props.entry, scope: 'agent' }),
        e.currentTarget as HTMLElement,
    )
}
</script>

<template>
    <div>
        <div class="flex items-center gap-1.5 hover:bg-base-200 cursor-pointer py-0.5 truncate"
            :style="{ paddingLeft: padding }" :title="entry.path" @click="onClick(entry)"
            @contextmenu="onRowContextMenu">
            <ChevronDownIcon v-if="entry.type === 'dir' && expanded" class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
            <ChevronRightIcon v-else-if="entry.type === 'dir'" class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
            <span v-else class="w-3.5 shrink-0" />

            <LinkIcon v-if="entry.type === 'symlink'" class="h-3.5 w-3.5 shrink-0 text-base-content/40" />
            <FolderIcon v-else-if="entry.type === 'dir'" class="h-3.5 w-3.5 shrink-0 text-warning" />
            <DocumentIcon v-else class="h-3.5 w-3.5 shrink-0 text-base-content/60" />

            <span class="truncate flex-1">{{ entry.name }}</span>

            <!-- kebab：仅移动端可见；PC 走右键菜单。
                 a11y：aria-label / aria-haspopup=menu，让读屏器可拍出这是菜单触发器。 -->
            <button type="button"
                class="lg:hidden btn btn-ghost btn-xs btn-square shrink-0 opacity-60 hover:opacity-100"
                :aria-label="$t('workspace.menu.more')" :title="$t('workspace.menu.more')"
                aria-haspopup="menu" @click="onKebabClick">
                <EllipsisVerticalIcon class="h-4 w-4" />
            </button>
        </div>

        <div v-if="entry.type === 'dir' && expanded && isLoadingChildren"
            class="text-xs text-base-content/40" :style="{ paddingLeft: childPadding }">
            loading...
        </div>

        <template v-if="entry.type === 'dir' && expanded">
            <AgentFileTreeNode v-for="child in children" :key="child.path" :entry="child" :agent-id="agentId"
                :on-click="onClick" :depth="(depth ?? 0) + 1" />
        </template>
    </div>
</template>
