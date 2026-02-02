<script setup lang="ts">
import { useThemeStore } from './stores/theme'
// Initialize theme at app root
useThemeStore()
</script>

<template>
    <div class="h-screen w-screen pt-[env(safe-area-inset-top)] bg-base-100">
        <router-view />
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