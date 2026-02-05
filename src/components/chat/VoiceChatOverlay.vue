<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhoneXMarkIcon, MicrophoneIcon, SpeakerWaveIcon, EllipsisHorizontalIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
    status: 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
    transcript: string
    isOpen: boolean
    speakingText?: string
    isWaiting?: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const isPeeking = ref(false)
const startPeek = () => isPeeking.value = true
const endPeek = () => isPeeking.value = false

const statusText = computed(() => {
    switch (props.status) {
        case 'listening': return '我在听...'
        case 'processing': return '思考中...'
        case 'speaking':
            if (props.speakingText) return '正在朗读'
            if (props.isWaiting) return '正在请求语音...'
            return 'AI正在回复...'
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
        class="fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-300 select-none"
        style="-webkit-touch-callout: none;"
        :class="isPeeking ? 'bg-transparent backdrop-blur-none' : 'bg-base-100/50 backdrop-blur-sm'"
        @pointerdown="startPeek" @pointerup="endPeek" @pointerleave="endPeek" @pointercancel="endPeek"
        @contextmenu.prevent>

        <!-- Main Content Wrapper to hide during peek -->
        <div class="w-full h-full flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none"
            :class="{ 'opacity-0': isPeeking, 'opacity-100': !isPeeking }">

            <!-- Main Visualizer Area -->
            <div class="flex-1 flex flex-col items-center w-full max-w-md pt-15 space-y-8 pointer-events-auto">

                <!-- Avatar / Icon Ripple -->
                <div class="relative">
                    <div class="w-25 h-25 rounded-full bg-base-200 flex items-center justify-center shadow-xl ring-4 ring-base-300 relative z-10 transition-all duration-500"
                        :class="{ ' ring-primary': status === 'listening', 'ring-success': status === 'speaking' }">
                        <MicrophoneIcon v-if="status === 'listening'" class="w-16 h-16 text-primary animate-pulse" />
                        <EllipsisHorizontalIcon v-else-if="status === 'processing'"
                            class="w-16 h-16 text-info animate-bounce" />
                        <SpeakerWaveIcon v-else-if="status === 'speaking'"
                            class="w-16 h-16 text-success animate-pulse" />
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
                        {{ transcript || speakingText || (status === 'speaking' ? '...' : '') }}
                    </p>
                </div>
            </div>

            <!-- Controls -->
            <div class="pb-12 pointer-events-auto">
                <button @click.stop="emit('close')"
                    class="btn btn-error btn-circle btn-xl shadow-lg hover:scale-105 transition-transform" title="挂断">
                    <PhoneXMarkIcon class="w-8 h-8 text-white" />
                </button>
            </div>
        </div>
    </div>
</template>
