<script setup lang="ts">
/**
 * VSCode 风格的可折叠 section：
 * - header 始终可见，点击 toggle；左侧 chevron + 标题 + 可选 count 徽章
 * - 可选 #actions slot：放右侧操作按钮（如 + 文件 / + 目录），与 toggle 按钮平级，
 *   点击不会触发 section 折叠/展开（不嵌在 toggle button 内，事件天然不冒泡）
 * - body 在 open 时固定高度（默认 240px）、内部独立滚动
 * - 视觉风格匹配 daisyUI 主题；header 用 base-200 底色与 panel 区分
 *
 * 父组件持有 open 状态（受控），方便持久化到 settings store。
 */
import { computed } from 'vue'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'

const props = withDefaults(defineProps<{
    title: string
    open: boolean
    /** 可选数量徽章（如提交数、文件数） */
    count?: number | null
    /** body 固定高度，单位 px。默认 240。 */
    maxHeight?: number
}>(), {
    count: null,
    maxHeight: 240,
})

const emit = defineEmits<{ toggle: [open: boolean] }>()

const bodyStyle = computed(() => ({ height: `${props.maxHeight}px` }))

function onHeaderClick() {
    emit('toggle', !props.open)
}
</script>

<template>
    <div class="border-t border-base-200 shrink-0">
        <!-- header：toggle button + 可选 actions slot 平级；统一 bg-base-200/50 看上去是一行 -->
        <div class="flex items-stretch bg-base-200/50">
            <button type="button"
                class="flex-1 flex items-center gap-1 px-2 py-1.5 hover:bg-base-200 text-xs font-semibold uppercase tracking-wide text-base-content/70 select-none"
                @click="onHeaderClick">
                <ChevronDownIcon v-if="open" class="h-3.5 w-3.5 shrink-0" />
                <ChevronRightIcon v-else class="h-3.5 w-3.5 shrink-0" />
                <span class="flex-1 text-left truncate">{{ title }}</span>
                <span v-if="count !== null && count > 0"
                    class="text-[10px] font-mono normal-case text-base-content/50 shrink-0">
                    {{ count }}
                </span>
            </button>
            <div v-if="$slots.actions" class="flex items-center gap-0.5 pr-1 shrink-0">
                <slot name="actions" />
            </div>
        </div>
        <div v-if="open" class="overflow-y-auto" :style="bodyStyle">
            <slot />
        </div>
    </div>
</template>
