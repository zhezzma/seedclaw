<script setup lang="ts">
import BottomNav from '../components/BottomNav.vue'
</script>

<template>
    <div class="min-h-screen bg-base-100">
        <!-- Main content -->
        <router-view />
        <!-- Bottom navigation for mobile -->
        <BottomNav />
    </div>
</template>
