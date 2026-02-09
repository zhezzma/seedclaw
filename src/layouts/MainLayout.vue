<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'

// Async load layouts
const MobileLayout = defineAsyncComponent(() => import('./MobileLayout.vue'))
const DesktopLayout = defineAsyncComponent(() => import('./DesktopLayout.vue'))


const isDesktop = ref(window.matchMedia('(min-width: 1024px)').matches)

const updateLayout = (e: MediaQueryListEvent | MediaQueryList) => {
    isDesktop.value = e.matches
}

let mediaQuery: MediaQueryList

// Shared connection logic
onMounted(() => {
    mediaQuery = window.matchMedia('(min-width: 1024px)')
    mediaQuery.addEventListener('change', updateLayout)
})

onUnmounted(() => {
    if (mediaQuery) {
        mediaQuery.removeEventListener('change', updateLayout)
    }
})
</script>

<template>
    <component :is="isDesktop ? DesktopLayout : MobileLayout" />
</template>
