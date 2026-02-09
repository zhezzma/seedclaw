<script setup lang="ts">
import { watch } from 'vue'
import { useUiSettingsStore } from './stores/setting'
import { useGateway } from './composables/useGateway'
import { useToast } from './composables/useToast'
import { useGotify } from './composables/useGotify'
import MessagePlugin from './components/MessagePlugin.vue'
import ConfirmPlugin from './components/ConfirmPlugin.vue'
import ExecApprovalModal from './components/ExecApprovalModal.vue'

// Initialize theme at app root
useUiSettingsStore().initTheme()
// Initialize Gotify
useGotify().init()

const gatewayStore = useGateway()
const toastStore = useToast()

// Global error handler
watch(() => gatewayStore.lastError, (error: any) => {
    if (error) {
        // Ignore NOT_PAIRED error as it is handled in SetupView
        if (error.includes('pairing')) {
            gatewayStore.lastError = null
            return
        }
        //toastStore.error(error)
        // Clear error after showing toast to allow same error to trigger again if needed
        // and to clean up state.
        gatewayStore.lastError = null
    }
})
</script>

<template>
    <div class="fixed inset-0 pt-[env(safe-area-inset-top)] bg-base-100 overflow-hidden">
        <router-view />
        <MessagePlugin />
        <ExecApprovalModal />
        <ConfirmPlugin />
    </div>
</template>

<style></style>