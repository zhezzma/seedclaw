<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
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
        <!-- min-w-0：允许左区被压缩，标题 truncate 生效，不把 actions 挤出视口 -->
        <div class="flex-1 min-w-0 flex items-center gap-2">
            <template v-if="!$slots.left">
                <!-- 返回箭头：主页面仅移动端显示（桌面侧栏常驻无需返回）；
                     移动端开侧栏抽屉的汉堡只归 ChatHeader（主页）所有 -->
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle"
                    :class="{ 'lg:hidden': isMainPage }" :aria-label="$t('common.back')">
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
