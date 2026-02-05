<script setup lang="ts">
import { onMounted, watch } from 'vue'
import BottomNav from '../components/BottomNav.vue'
import { useUiSettingsStore } from '../stores/setting'
import { useGatewayStore } from '../stores/gateway'

const settingsStore = useUiSettingsStore()
const gatewayStore = useGatewayStore()

// Auto-connect when entering main layout if configured
onMounted(() => {
    if (settingsStore.isConfigured && !gatewayStore.connected && !gatewayStore.connecting) {
        gatewayStore.connect().catch((err) => {
            console.error('[MainLayout] Auto-connect failed:', err)
        })
    }
})

// Watch for disconnection and auto-reconnect
watch(() => gatewayStore.connected, (connected) => {
    if (!connected && settingsStore.isConfigured && !gatewayStore.connecting) {
        // Small delay before reconnect attempt
        setTimeout(() => {
            if (!gatewayStore.connected && !gatewayStore.connecting) {
                gatewayStore.connect().catch((err) => {
                    console.error('[MainLayout] Reconnect failed:', err)
                })
            }
        }, 1000)
    }
})
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
