<script setup lang="ts">
import { useThemeStore } from './stores/theme'
// Initialize theme at app root
useThemeStore()
</script>

<template>
    <router-view />
</template>

<style>
html,
body,
#app {
    height: 100%;
    margin: 0;
    padding: 0;
}
</style>