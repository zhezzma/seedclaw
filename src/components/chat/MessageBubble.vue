<script setup lang="ts">
import {
    ClipboardIcon,
    SpeakerWaveIcon,
    StopIcon
} from '@heroicons/vue/24/outline'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ToolInvocation from './ToolInvocation.vue'
import type { DisplayMessage } from '../../composables/useChatMessages'

const props = defineProps<{
    message: DisplayMessage
    assistantName: string
    assistantAvatar: string | null | undefined
    currentReadingMsgId: string | null
    formatTime: (timestamp?: number) => string
    isAvatarUrl: (avatar: string | null | undefined) => boolean
}>()

const emit = defineEmits<{
    (e: 'copy', msg: DisplayMessage): void
    (e: 'read-aloud', msg: DisplayMessage): void
}>()
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
            <time v-if="message.timestamp" class="ml-1">{{ formatTime(message.timestamp) }}</time>
        </div>

        <!-- User Message Bubble -->
        <div v-if="message.role === 'user'" class="chat-bubble chat-bubble-primary relative">
            <div class="whitespace-normal">
                <template v-for="(block, bIndex) in message.blocks" :key="bIndex">
                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''" :asUser="true" />
                </template>
            </div>
        </div>
        <!-- User Actions (Hover) -->
        <div v-if="message.role === 'user'"
            class="chat-footer opacity-0 group-hover:opacity-100 transition-all duration-200 mt-1">
            <button @click="emit('copy', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                title="复制">
                <ClipboardIcon class="h-4 w-4" />
            </button>
        </div>

        <!-- Assistant Message Bubble -->
        <div v-else class="chat-bubble w-full relative">
            <div class="whitespace-normal flex flex-col gap-2">
                <template v-for="(block, bIndex) in message.blocks" :key="bIndex">
                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''" />
                    <ToolInvocation v-else-if="block.type === 'tool'" :toolName="block.toolName || 'Unknown Tool'"
                        :args="block.toolArgs || {}" :result="block.toolResult" :state="block.toolState"
                        :errorMessage="block.toolError" />
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
