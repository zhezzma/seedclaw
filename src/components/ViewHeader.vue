<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeftIcon, Bars3Icon } from '@heroicons/vue/24/outline'
import { isDesktopTauri } from '../utils/environment'

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

const router = useRouter()

const goBack = () => {
    // 深链直达/重启落地时无上一条历史，back() 会空转甚至退出 webview；
    // 兜底回首页（home 会 redirect 到 chat/new），语义同 AgentsView.clearSelection
    const backPath = (window.history.state as any)?.back
    if (typeof backPath === 'string' && backPath !== '') {
        router.back()
    } else {
        router.replace({ name: 'home' })
    }
}
</script>

<template>
    <!-- 桌面端 Tauri：顶栏即标题栏（deep 拖拽，双击最大化由 Tauri 内置脚本处理） -->
    <div class="shrink-0 navbar min-h-[3rem]"
        :class="[{ 'border-b border-base-300': showBorder }, wcPad && isDesktopTauri && 'pr-[144px]']"
        :data-tauri-drag-region="isDesktopTauri ? 'deep' : undefined">
        <div class="flex-1 flex items-center gap-2">
            <template v-if="!$slots.left">
                <!-- 主页面（移动端）：汉堡开侧栏抽屉，抽屉节点由 MobileLayout 托管；
                     桌面端侧栏常驻，什么都不渲染 -->
                <div v-if="isMainPage" class="flex-none lg:hidden">
                    <label for="sidebar-drawer" :aria-label="$t('common.openSidebar')" class="btn btn-ghost btn-sm btn-circle drawer-button">
                        <Bars3Icon class="w-5 h-5" />
                    </label>
                </div>
                <!-- 子页面：返回箭头 -->
                <button v-else @click="goBack" class="btn btn-ghost btn-sm btn-circle">
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
