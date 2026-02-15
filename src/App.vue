<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
// import { onAction } from '@tauri-apps/plugin-notification' // Keep if needed, but might be optional
// import { listen } from '@tauri-apps/api/event'
import { useUiSettingsStore } from './stores/setting'
import MessagePlugin from './components/MessagePlugin.vue'
import ConfirmPlugin from './components/ConfirmPlugin.vue'
import ExecApprovalModal from './components/ExecApprovalModal.vue'
import { useAppInit } from './composables/useAppInit'
import { useToast } from './composables/useToast'

// Initialize app
const uiSettings = useUiSettingsStore()
uiSettings.initTheme()
uiSettings.initLanguage()

const appInit = useAppInit()
appInit.init()

const router = useRouter()
// const notificationMap = ref<Record<string, string>>({})
// let unlistenNotification: (() => void) | null = null

onMounted(async () => {
    // try {
    //     // Setup notification listeners if needed
    // } catch (e) {
    //     console.error(e)
    // }
})

onUnmounted(() => {
    // if (unlistenNotification) {
    //     unlistenNotification()
    // }
})
</script>

<template>
    <div class="fixed inset-0 bg-base-100 overflow-hidden text-base-content font-sans">
        <RouterView />
        <MessagePlugin />
        <ConfirmPlugin />
        <ExecApprovalModal />
    </div>
</template>

<style>
/* Global styles */
</style>