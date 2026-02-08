<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'

const props = withDefaults(defineProps<{
    title: string
    showBack?: boolean
}>(), {
    showBack: true
})

const router = useRouter()

const goBack = () => {
    router.back()
}
</script>

<template>
    <div class="shrink-0 navbar bg-base-100 border-b border-base-300 min-h-[4rem]">
        <div class="flex-1 gap-2">
            <button v-if="showBack" @click="goBack" class="btn btn-ghost btn-sm btn-circle lg:hidden">
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
