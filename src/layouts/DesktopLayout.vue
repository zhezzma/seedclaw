<script setup lang="ts">
import AppSidebar from '../components/AppSidebar.vue'
import { useUiSettingsStore } from '../stores/setting'

const configStore = useUiSettingsStore()
</script>

<template>
    <div class="flex h-full bg-base-100 overflow-hidden">
        <!-- Sidebar -->
        <div class="h-full shrink-0 border-r border-base-200 transition-[width] duration-200"
            :class="configStore.isSidebarCollapsed ? 'w-16' : 'w-64'">
            <AppSidebar />
        </div>

        <!-- Main Content -->
        <div class="flex-1 h-full min-w-0 overflow-hidden relative">
            <router-view />
        </div>
    </div>
</template>
