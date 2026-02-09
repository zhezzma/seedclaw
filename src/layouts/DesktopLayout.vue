<script setup lang="ts">
import AppSidebar from '../components/AppSidebar.vue'
</script>

<template>
    <div class="flex h-full bg-base-100 overflow-hidden">
        <!-- Sidebar -->
        <div class="w-64 h-full shrink-0 border-r border-base-200">
            <AppSidebar />
        </div>

        <!-- Main Content -->
        <div class="flex-1 h-full min-w-0 overflow-hidden relative">
            <router-view />
        </div>
    </div>
</template>
