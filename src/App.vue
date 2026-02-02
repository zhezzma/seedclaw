<script setup lang="ts">
import AppSidebar from './components/AppSidebar.vue'
import BottomNav from './components/BottomNav.vue'
</script>

<template>
    <!-- Main layout using daisyUI Drawer -->
    <div class="drawer lg:drawer-open h-screen">
        <input id="sidebar-drawer" type="checkbox" class="drawer-toggle" />

        <!-- Main content area -->
        <div class="drawer-content flex flex-col bg-base-100">
            <router-view />
            <BottomNav />
        </div>

        <!-- Sidebar drawer -->
        <div class="drawer-side z-40">
            <label for="sidebar-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
            <div class="w-80 h-full bg-base-200">
                <AppSidebar />
            </div>
        </div>
    </div>
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