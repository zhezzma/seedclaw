<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../stores/setting'

const props = withDefaults(defineProps<{
    title: string
    isMainPage?: boolean
}>(), {
    isMainPage: false
})

const router = useRouter()
const settings = useUiSettingsStore()

const shouldShowBack = computed(() => {
    // 如果是二级页面（非主页），总是显示
    if (!props.isMainPage) return true

    // 如果是主页，仅在底部导航隐藏时显示（移动端场景）
    // 注意：PC 端主页的隐藏逻辑由 template 中的 lg:hidden 类处理
    return !settings.showBottomNav
})

const goBack = () => {
    router.back()
}
</script>

<template>
    <div class="shrink-0 navbar bg-base-100 border-b border-base-300 min-h-[4rem]">
        <div class="flex-1 flex items-center gap-2">
            <button v-if="shouldShowBack" @click="goBack" class="btn btn-ghost btn-sm btn-circle"
                :class="{ 'lg:hidden': isMainPage }">
                <ArrowLeftIcon class="w-5 h-5" />
            </button>
            <span class="text-lg font-semibold px-2  truncate">{{ title }}</span>
            <slot name="center"></slot>
        </div>
        <div class="flex-none gap-2">
            <slot name="actions"></slot>
        </div>
    </div>
</template>
