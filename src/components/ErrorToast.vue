<script setup lang="ts">
import { computed } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { useGatewayStore } from '../stores/gateway'

const gatewayStore = useGatewayStore()

const hasError = computed(() => Boolean(gatewayStore.lastError))

const closeError = () => {
    gatewayStore.lastError = null
}
</script>

<template>
    <Transition name="slide-down">
        <div v-if="hasError" class="toast toast-top toast-center z-50 mt-4">
            <div class="alert alert-error shadow-lg max-w-md">
                <div class="flex items-center gap-3 w-full">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none"
                        viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="flex-1">{{ gatewayStore.lastError }}</span>
                    <button @click="closeError" class="btn btn-ghost btn-sm btn-circle">
                        <XMarkIcon class="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
    transition: all 0.3s ease;
}

.slide-down-enter-from {
    transform: translateY(-100%);
    opacity: 0;
}

.slide-down-leave-to {
    transform: translateY(-100%);
    opacity: 0;
}
</style>
