<script setup lang="ts">
import AppSidebar from '../components/AppSidebar.vue'
import ChatArea from '../components/ChatArea.vue'
</script>

<template>
    <!-- Main layout using daisyUI Drawer -->
    <div class="drawer lg:drawer-open h-screen">
        <input id="sidebar-drawer" type="checkbox" class="drawer-toggle" />

        <!-- Main content area -->
        <div class="drawer-content flex flex-col bg-base-100 h-screen overflow-hidden">
            <ChatArea />
        </div>

        <!-- Sidebar drawer -->
        <div class="drawer-side z-[60]">
            <label for="sidebar-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
            <div class="w-80 h-full bg-base-200">
                <AppSidebar />
            </div>
        </div>
    </div>
</template>
