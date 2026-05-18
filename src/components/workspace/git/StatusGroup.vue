<script setup lang="ts">
/**
 * VSCode 风格的状态分组：Changes / Staged / Untracked。
 *
 * - 行点击 → 调用父级传入的 onClick（最终走到 viewer.openDiff）。
 * - 行内 actions（VSCode 风格 hover 按钮）：父级用 buildInlineActions 工厂返回每行的按钮配置。
 *   PC：默认隐藏，鼠标移上行才显示（group + lg:group-hover）。
 *   移动端：按钮始终可见（lg: 断点以下）。
 * - 行右键 → 弹 ContextMenu（由 buildItems 构造，含 Open File / Open Changes / Stage / Discard 等）。
 * - header 右侧通过 #actions slot 接入分组级动作（stage all / unstage all / discard all）。
 *
 * 状态字符按 git 语义映射颜色，与 VSCode 颜色约定保持一致。
 */
import { ref, computed } from 'vue'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/vue/24/outline'
import type { FileChange } from '../../../composables/workspace-api'
import { useContextMenu, type ContextMenuItem } from '../../../composables/useContextMenu'
import type { InlineAction } from '../../../composables/useGitFileActions'

const props = defineProps<{
    title: string
    changes: FileChange[]
    /** 受控模式：传了就以调用者为准，使 open。不传走内部默认（展开）。 */
    open?: boolean
    /** 始终显示 header，哪怕 changes 为空（对齐 VSCode “工作区改动”常驻在列表里）。 */
    alwaysShow?: boolean
    onClick: (change: FileChange) => void
    buildItems?: (change: FileChange) => ContextMenuItem[]
    buildInlineActions?: (change: FileChange) => InlineAction[]
}>()

const emit = defineEmits<{ toggle: [open: boolean] }>()

const internalOpen = ref(true)
const isControlled = computed(() => props.open !== undefined)
const open = computed(() => isControlled.value ? !!props.open : internalOpen.value)

function toggle() {
    if (props.changes.length === 0) return
    const next = !open.value
    if (isControlled.value) emit('toggle', next)
    else internalOpen.value = next
}

const ctxMenu = useContextMenu()

/**
 * git porcelain 状态字符 → daisyUI 语义颜色类
 *  M / T 修改 → warning（黄）
 *  A      新增 → success（绿）
 *  D      删除 → error（红）
 *  R / C  重命名 / 复制 → info（蓝）
 *  U      合并冲突 → error 加粗
 *  ?      未跟踪 → success
 */
function statusClass(s: string): string {
    if (s === 'M' || s === 'T') return 'text-warning'
    if (s === 'A') return 'text-success'
    if (s === 'D') return 'text-error'
    if (s === 'R' || s === 'C') return 'text-info'
    if (s === 'U') return 'text-error font-bold'
    if (s === '?') return 'text-success'
    return ''
}

function onRowContextMenu(e: MouseEvent, change: FileChange) {
    if (!props.buildItems) return
    const items = props.buildItems(change)
    if (items.length === 0) return
    e.preventDefault()
    ctxMenu.openAt(items, { x: e.clientX, y: e.clientY })
}

/** 行内按钮点击 → 阻止冒泡到 row click（行 click 是 openDiff，按钮自己有动作）。 */
function onInlineClick(e: MouseEvent, action: InlineAction) {
    e.stopPropagation()
    if (action.disabled) return
    void action.action()
}
</script>

<template>
    <div v-if="changes.length > 0 || alwaysShow" class="border-b border-base-200">
        <!-- header：左侧 toggle + 标题；右侧 actions slot（stage all / discard all 等）。
             空 list 时 toggle 被禁用，免得点击之后点击举动什么都不发生。 -->
        <div class="flex items-stretch">
            <button class="flex-1 flex items-center gap-1 text-left text-xs px-2 py-1"
                :class="changes.length > 0 ? 'hover:bg-base-200' : 'cursor-default text-base-content/50'"
                :disabled="changes.length === 0"
                @click="toggle">
                <ChevronDownIcon v-if="open && changes.length > 0" class="h-3 w-3" />
                <ChevronRightIcon v-else-if="changes.length > 0" class="h-3 w-3" />
                <span v-else class="w-3" />
                <span class="font-medium flex-1 truncate">{{ title }}</span>
                <span class="text-base-content/50 shrink-0">{{ changes.length }}</span>
            </button>
            <div v-if="$slots.actions" class="flex items-center gap-0.5 pr-1 shrink-0">
                <slot name="actions" />
            </div>
        </div>
        <div v-if="open && changes.length > 0">
            <!-- 行容器加 .group：让行内按钮可以用 lg:group-hover 控制 PC 上的可见性。 -->
            <div v-for="(change, idx) in changes" :key="`${change.path}-${idx}`"
                class="group flex items-center gap-2 text-xs px-3 py-1 hover:bg-base-200 font-mono cursor-pointer"
                :title="change.path" @click="onClick(change)" @contextmenu="onRowContextMenu($event, change)">
                <span class="w-3 shrink-0" :class="statusClass(change.status)">{{ change.status }}</span>
                <span class="truncate flex-1">
                    <template v-if="change.oldPath">{{ change.path }} ← {{ change.oldPath }}</template>
                    <template v-else>{{ change.path }}</template>
                </span>
                <!-- 行内按钮：mobile 始终可见；PC 默认 invisible、行 hover 才可见。
                     用 invisible/visible 而不是 hidden：保留布局空间 → 纯 hover 只变透明度，不会
                     畑使行高在 hover 进 / 出时变化产生抖动。 -->
                <div v-if="buildInlineActions"
                    class="flex items-center gap-0 shrink-0 lg:invisible lg:group-hover:visible">
                    <button v-for="(act, j) in buildInlineActions(change)" :key="j"
                        type="button" class="btn btn-ghost btn-xs btn-square"
                        :class="{ 'text-error': act.danger }" :disabled="act.disabled"
                        :aria-label="act.label" :title="act.label" @click="onInlineClick($event, act)">
                        <component :is="act.icon" class="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
