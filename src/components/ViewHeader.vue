<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'

const props = withDefaults(defineProps<{
    title?: string
    isMainPage?: boolean
    showBorder?: boolean
    // 内容区顶栏置 true：为右上角悬浮窗口键预留宽度（侧栏内的顶栏不需要）
    wcPad?: boolean
}>(), {
    isMainPage: false,
    title: '',
    showBorder: true,
    wcPad: false
})

// 桌面端 Tauri：顶栏即标题栏（deep 拖拽，双击最大化由 Tauri 内置脚本处理）
const isDesktopTauri = (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__)
    && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

const router = useRouter()

const goBack = () => {
    router.back()
}
</script>

<template>
    <div class="shrink-0 navbar min-h-[3rem]"
        :class="[{ 'border-b border-base-300': showBorder }, wcPad && isDesktopTauri && 'pr-[144px]']"
        :data-tauri-drag-region="isDesktopTauri ? 'deep' : undefined">
        <div class="flex-1 flex items-center gap-2">
            <template v-if="!$slots.left">
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle"
                    :class="{ 'lg:hidden': isMainPage }">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
            </template>
            <slot name="left"></slot> 
            <span v-if="title" class="text-lg font-semibold truncate">{{ title }}</span>
            <slot v-else name="title"></slot>
            <slot name="center"></slot>
        </div>
        <slot name="actions"></slot>
    </div>
</template>
