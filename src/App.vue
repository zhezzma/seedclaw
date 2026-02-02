<script setup lang="ts">
import { useUiSettingsStore } from './stores/setting'
import ErrorToast from './components/ErrorToast.vue'
// Initialize theme at app root
useUiSettingsStore().initTheme()
</script>

<template>
    <div class="h-screen w-screen pt-[env(safe-area-inset-top)] bg-base-100">
        <router-view />
        <ErrorToast />
    </div>
</template>

<style>
html,
body,
#app {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
}
</style>