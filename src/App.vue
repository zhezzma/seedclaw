<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useUiSettingsStore } from './stores/setting'
import MessagePlugin from './components/MessagePlugin.vue'
import ConfirmPlugin from './components/ConfirmPlugin.vue'
import ExecApprovalModal from './components/ExecApprovalModal.vue'
import { useAppInit } from './composables/useAppInit'
// Initialize theme at app root
useUiSettingsStore().initTheme()
// Initialize app and connect
useAppInit().init()

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