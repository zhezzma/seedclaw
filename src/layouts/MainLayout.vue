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
    <div class="h-full bg-base-100">
        <!-- Main content -->
        <router-view />
        <!-- Bottom navigation for mobile -->
        <BottomNav />
    </div>
</template>
