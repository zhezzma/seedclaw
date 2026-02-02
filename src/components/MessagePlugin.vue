<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastStore, type ToastType } from '../stores/toast'
import {
    CheckCircleIcon,
    XCircleIcon,
    InformationCircleIcon,
    ExclamationTriangleIcon,
    XMarkIcon
} from '@heroicons/vue/24/outline'

const store = useToastStore()
const { toasts } = storeToRefs(store)

const getAlertClass = (type: ToastType) => {
    switch (type) {
        case 'success': return 'alert-success text-white'
        case 'error': return 'alert-error text-white'
        case 'warning': return 'alert-warning text-white'
        case 'info': return 'alert-info text-white'
        default: return 'alert-info text-white'
    }
}

const getIcon = (type: ToastType) => {
    switch (type) {
        case 'success': return CheckCircleIcon
        case 'error': return XCircleIcon
        case 'warning': return ExclamationTriangleIcon
        case 'info': return InformationCircleIcon
        default: return InformationCircleIcon
    }
}
</script>

<template>
    <div class="toast toast-top toast-center z-50 flex flex-col gap-2 pointer-events-none">
        <TransitionGroup name="toast-fade">
            <div v-for="toast in toasts" :key="toast.id"
                class="alert shadow-lg min-w-[300px] pointer-events-auto flex items-center p-3"
                :class="getAlertClass(toast.type)">
                <component :is="getIcon(toast.type)" class="w-6 h-6 stroke-current shrink-0" />
                <span class="flex-1 text-sm font-medium">{{ toast.message }}</span>
                <button @click="store.remove(toast.id)" class="btn btn-ghost btn-sm btn-circle text-current">
                    <XMarkIcon class="w-5 h-5" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>

<style scoped>
.toast-fade-enter-active,
.toast-fade-leave-active {
    transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
    opacity: 0;
    transform: translateY(-20px);
}
</style>
