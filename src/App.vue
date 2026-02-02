<script setup lang="ts">
import { watch } from 'vue'
import { useUiSettingsStore } from './stores/setting'
import { useGatewayStore } from './stores/gateway'
import { useToastStore } from './stores/toast'
import MessagePlugin from './components/MessagePlugin.vue'

// Initialize theme at app root
useUiSettingsStore().initTheme()

const gatewayStore = useGatewayStore()
const toastStore = useToastStore()

// Global error handler
watch(() => gatewayStore.lastError, (error: any) => {
    if (error) {
        console.log(error)
        // Ignore NOT_PAIRED error as it is handled in SetupView
        if (error.includes('pairing')) {
            gatewayStore.lastError = null
            return
        }

        toastStore.error(error)
        // Clear error after showing toast to allow same error to trigger again if needed
        // and to clean up state.
        gatewayStore.lastError = null
    }
})
</script>

<template>
    <div class="h-screen w-screen pt-[env(safe-area-inset-top)] bg-base-100">
        <router-view />
        <MessagePlugin />
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