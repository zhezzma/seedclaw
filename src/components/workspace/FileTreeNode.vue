<script setup lang="ts">
/**
 * 单个目录/文件节点；目录展开时递归渲染自身。
 *
 * 通过 defineOptions({ name }) 显式声明组件名，使模板里能直接 `<FileTreeNode>` 自引用。
 *
 * 上下文菜单：
 * - PC：行 @contextmenu.prevent → openAt(鼠标位置)
 * - 移动端：行尾 kebab 按钮（lg:hidden）@click → openAtElement(按钮)
 *   PC 上不显示 kebab，避免每行多一个图标污染密度。
 */
import { computed } from 'vue'
import {
    ChevronRightIcon, ChevronDownIcon,
    FolderIcon, DocumentIcon, LinkIcon,
    EllipsisVerticalIcon,
} from '@heroicons/vue/24/outline'
import { useWorkspaceTree } from '../../composables/useWorkspaceTree'
import { useContextMenu } from '../../composables/useContextMenu'
import { buildFileMenuItems } from '../../composables/useFileActions'
import type { TreeEntry } from '../../composables/workspace-api'

defineOptions({ name: 'FileTreeNode' })

const props = defineProps<{
    entry: TreeEntry
    agentId: string
    onClick: (entry: TreeEntry) => void
    onClickRepoBadge: (entry: TreeEntry) => void
    depth?: number
}>()

const tree = useWorkspaceTree()
const ctxMenu = useContextMenu()
const expanded = computed(() => tree.isExpanded(props.entry.path))
const children = computed(() => tree.entriesAt(props.entry.path)?.entries || [])
const isLoadingChildren = computed(() => tree.isLoading(props.entry.path))

const padding = computed(() => `${(props.depth ?? 0) * 12 + 8}px`)
const childPadding = computed(() => `${((props.depth ?? 0) + 1) * 12 + 8}px`)

function onBadgeClick(e: MouseEvent) {
    e.stopPropagation()
    props.onClickRepoBadge(props.entry)
}

function onRowContextMenu(e: MouseEvent) {
    e.preventDefault()
    ctxMenu.openAt(
        buildFileMenuItems({ agentId: props.agentId, entry: props.entry, scope: 'workspace' }),
        { x: e.clientX, y: e.clientY },
    )
}

function onKebabClick(e: MouseEvent) {
    e.stopPropagation()
    ctxMenu.openAtElement(
        buildFileMenuItems({ agentId: props.agentId, entry: props.entry, scope: 'workspace' }),
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

            <span v-if="entry.isGitRepo" class="badge badge-sm badge-ghost shrink-0 cursor-pointer"
                @click="onBadgeClick">⎇ git</span>

            <!-- kebab：仅移动端可见（lg:hidden）；PC 走右键菜单避免每行图标污染。
                 a11y：aria-label 让读屏器能拍出 “更多操作”；aria-haspopup=menu 提示这是菜单触发。 -->
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
            <FileTreeNode v-for="child in children" :key="child.path" :entry="child" :agent-id="agentId"
                :on-click="onClick" :on-click-repo-badge="onClickRepoBadge" :depth="(depth ?? 0) + 1" />
        </template>
    </div>
</template>
