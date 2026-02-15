<script setup lang="ts">
import { onMounted, watch } from 'vue'
import BottomNav from '../components/BottomNav.vue'
import { useUiSettingsStore } from '../stores/setting'

const settingsStore = useUiSettingsStore()

</script>

<template>
    <div class="h-full bg-base-100 flex flex-col">
        <!-- Main content -->
        <div class="flex-1 min-h-0" :class="{ 'pb-16 lg:pb-0': settingsStore.showBottomNav }">
            <router-view />
        </div>
        <!-- Bottom navigation for mobile -->
        <BottomNav v-if="settingsStore.showBottomNav" />
    </div>
</template>
