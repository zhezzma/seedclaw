<script setup lang="ts">
import {
    ClipboardIcon,
    SpeakerWaveIcon,
    StopIcon
} from '@heroicons/vue/24/outline'
import { computed } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ToolInvocation from './ToolInvocation.vue'
import { useChatState } from '../../composables/useChatState'
import { useTTS } from '../../composables/useTTS'
import type { DisplayMessage } from '../../composables/useChatMessages'

const props = defineProps<{
    message: DisplayMessage
    isLoading?: boolean
}>()

const emit = defineEmits<{
    (e: 'copy', msg: DisplayMessage): void
    (e: 'read-aloud', msg: DisplayMessage): void
}>()

const chatState = useChatState()
const { currentReadingMsgId } = useTTS()

// Helper functions
const formatTime = (timestamp?: number): string => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const isAvatarUrl = (avatar: string | null | undefined): boolean => {
    if (!avatar) return false
    return avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/')
}

const assistantName = computed(() => chatState.assistantName || 'Assistant')
const assistantAvatar = computed(() => isAvatarUrl(chatState.assistantAvatar) ? chatState.chatAvatarUrl : chatState.assistantAvatar)
</script>

<template>
    <div class="chat group" :class="message.role === 'user' ? 'chat-end' : 'chat-start'">
        <!-- Avatar -->
        <div class="chat-image avatar hidden md:block">
            <div class="w-10 rounded-full bg-base-300 flex items-center justify-center overflow-hidden">
                <template v-if="message.role === 'user'">
                    <span class="text-lg">👤</span>
                </template>
                <template v-else>
                    <img v-if="isAvatarUrl(assistantAvatar)" :src="assistantAvatar || undefined"
                        class="w-full h-full object-cover" />
                    <span v-else-if="assistantAvatar" class="text-lg">{{ assistantAvatar }}</span>
                    <span v-else class="text-lg">🤖</span>
                </template>
            </div>
        </div>
        <!-- Header -->
        <div class="chat-header opacity-70 text-xs mb-1">
            {{ message.role === 'user' ? '你' : assistantName || 'Assistant' }}
            <!-- <span v-if="isLoading && message.role !== 'user'" class="ml-1 loading loading-dots loading-xs"></span> -->
            <time v-if="message.timestamp" class="ml-1">{{ formatTime(message.timestamp) }}</time>
        </div>

        <!-- User Message Bubble -->
        <div v-if="message.role === 'user'" class="chat-bubble chat-bubble-primary relative">
            <div class="whitespace-normal">
                <template v-for="(block, bIndex) in message.blocks" :key="bIndex">
                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''" :asUser="true" />
                    <div v-else-if="block.type === 'image'"
                        class="rounded-lg overflow-hidden border border-white/20 my-1 bg-black/10">
                        <!-- User images might be base64 source -->
                        <img :src="block.source?.data || ''" class="max-w-full max-h-[300px] object-contain" />
                    </div>
                    <div v-else-if="block.type === 'file'"
                        class="rounded-lg border border-white/20 my-1 bg-white/10 p-3 flex items-center gap-3">
                        <div class="w-10 h-10 rounded bg-white/20 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                stroke="currentColor" class="w-6 h-6 opacity-80">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium truncate" :title="block.source?.name">{{ block.source?.name
                                || 'File' }}</div>
                            <div class="text-xs opacity-70">Attachment</div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
        <!-- User Actions (Hover) -->
        <div v-if="message.role === 'user'"
            class="chat-footer opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-200 mt-1">
            <button @click="emit('copy', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                title="复制">
                <ClipboardIcon class="h-4 w-4" />
            </button>
        </div>

        <!-- Assistant Message Bubble -->
        <div v-else class="chat-bubble w-full relative">
            <div class="whitespace-normal flex flex-col gap-2">
                <!-- Loading indicator if empty or just waiting -->
                <div v-if="isLoading && (!message.blocks.length || (message.blocks.length === 1 && message.blocks[0].type === 'text' && !message.blocks[0].text))"
                    class="loading loading-dots loading-sm opacity-50 "></div>
                <template v-else v-for="(block, bIndex) in message.blocks" :key="bIndex">
                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ``" />
                    <ToolInvocation v-else-if="block.type === 'tool'" :toolName="block.toolName || 'Unknown Tool'"
                        :args="block.toolArgs || {}" :result="block.toolResult" :state="block.toolState"
                        :errorMessage="block.toolError" />
                    <div v-else-if="block.type === 'image'"
                        class="rounded-lg overflow-hidden border border-base-300 my-1">
                        <img :src="block.source?.data || ''" class="max-w-full max-h-[300px] object-contain" />
                    </div>
                    <div v-else-if="block.type === 'file'"
                        class="rounded-lg border border-base-300 my-1 bg-base-100 p-3 flex items-center gap-3">
                        <div class="w-10 h-10 rounded bg-base-200 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                stroke="currentColor" class="w-6 h-6 opacity-60">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium truncate" :title="block.source?.name">{{ block.source?.name
                                || 'File' }}</div>
                            <div class="text-xs opacity-70">Attachment</div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
        <!-- Assistant Actions (Fixed) -->
        <div v-if="message.role !== 'user'" class="chat-footer mt-1 flex gap-1">
            <button @click="emit('copy', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                title="复制">
                <ClipboardIcon class="h-4 w-4" />
            </button>
            <button @click="emit('read-aloud', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                :class="{ 'bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-700': currentReadingMsgId === message.id }"
                title="朗读">
                <template v-if="currentReadingMsgId === message.id">
                    <StopIcon class="h-4 w-4" />
                </template>
                <template v-else>
                    <SpeakerWaveIcon class="h-4 w-4" />
                </template>
            </button>
        </div>
    </div>
</template>
