<script setup lang="ts">
import { computed } from 'vue'
import { PhoneXMarkIcon, MicrophoneIcon, SpeakerWaveIcon, EllipsisHorizontalIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
    status: 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
    transcript: string
    isOpen: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const statusText = computed(() => {
    switch (props.status) {
        case 'listening': return '我在听...'
        case 'processing': return '思考中...'
        case 'speaking': return '正在回复...'
        case 'error': return '出错了'
        default: return '准备就绪'
    }
})

const statusColor = computed(() => {
    switch (props.status) {
        case 'listening': return 'text-primary'
        case 'processing': return 'text-info'
        case 'speaking': return 'text-success'
        case 'error': return 'text-error'
        default: return 'text-base-content'
    }
})
</script>

<template>
    <div v-if="isOpen"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-base-100/50 backdrop-blur-sm">
        <!-- Main Visualizer Area -->
        <div class="flex-1 flex flex-col items-center justify-center w-full max-w-md p-6 space-y-8">

            <!-- Avatar / Icon Ripple -->
            <div class="relative">
                <div class="w-32 h-32 rounded-full bg-base-200 flex items-center justify-center shadow-xl ring-4 ring-base-300 relative z-10 transition-all duration-500"
                    :class="{ 'scale-110 ring-primary': status === 'listening', 'ring-success': status === 'speaking' }">
                    <MicrophoneIcon v-if="status === 'listening'" class="w-16 h-16 text-primary animate-pulse" />
                    <EllipsisHorizontalIcon v-else-if="status === 'processing'"
                        class="w-16 h-16 text-info animate-bounce" />
                    <SpeakerWaveIcon v-else-if="status === 'speaking'" class="w-16 h-16 text-success animate-pulse" />
                    <div v-else class="w-16 h-16 rounded-full bg-base-content/10"></div>
                </div>

                <!-- Ripple effects -->
                <div v-if="status === 'listening' || status === 'speaking'"
                    class="absolute inset-0 rounded-full bg-current opacity-20 animate-ping"
                    :class="status === 'listening' ? 'text-primary' : 'text-success'"></div>
            </div>

            <!-- Status Text -->
            <div class="text-center space-y-2">
                <h2 class="text-2xl font-bold transition-colors" :class="statusColor">{{ statusText }}</h2>
                <p class="text-base-content/60 min-h-[1.5em] px-4 break-words line-clamp-3">
                    {{ transcript || (status === 'speaking' ? 'AI正在回复...' : '') }}
                </p>
            </div>
        </div>

        <!-- Controls -->
        <div class="pb-12">
            <button @click="emit('close')"
                class="btn btn-error btn-circle btn-lg shadow-lg hover:scale-105 transition-transform" title="挂断">
                <PhoneXMarkIcon class="w-8 h-8 text-white" />
            </button>
        </div>
    </div>
</template>
