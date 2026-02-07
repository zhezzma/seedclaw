<script setup lang="ts">
import {
    ClipboardIcon,
    SpeakerWaveIcon,
    StopIcon
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
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

// Parse user message blocks to extract file content and fix image data paths
const userParsedBlocks = computed(() => {
    if (props.message.role !== 'user') return props.message.blocks || []
    if (!props.message.blocks) return []

    const result = [] as any[]

    for (const block of props.message.blocks) {
        // Handle text blocks - extract file content markers
        if (block.type === 'text' && block.text) {
            // Pattern: === File Content: filename === content ==============================
            const fileRegex = /=== File Content: (.*?) ===([\s\S]*?)==============================/g
            let lastIndex = 0
            let match
            let hasMatch = false

            while ((match = fileRegex.exec(block.text)) !== null) {
                hasMatch = true
                // Add text before the match
                if (match.index > lastIndex) {
                    const text = block.text.slice(lastIndex, match.index).trim()
                    if (text) {
                        result.push({ type: 'text', text })
                    }
                }

                // Add the file block
                result.push({
                    type: 'file',
                    fileName: match[1].trim() || 'File',
                    fileContent: match[2].trim()
                })

                lastIndex = match.index + match[0].length
            }

            if (hasMatch) {
                // Add remaining text after last match
                if (lastIndex < block.text.length) {
                    const text = block.text.slice(lastIndex).trim()
                    if (text) {
                        result.push({ type: 'text', text })
                    }
                }
            } else {
                // No file content found, keep original block
                result.push(block)
            }
        }
        // Handle image blocks - source.data is raw base64, build full data URL
        else if (block.type === 'image') {
            const sourceData = block.source?.data || ''
            const mediaType = block.source?.media_type || 'image/png'
            const src = sourceData ? `data:${mediaType};base64,${sourceData}` : ''

            result.push({
                type: 'image',
                src
            })
        }
        else {
            result.push(block)
        }
    }

    return result
})

// Image lightbox state
const lightboxOpen = ref(false)
const lightboxSrc = ref('')

const openLightbox = (src: string) => {
    lightboxSrc.value = src
    lightboxOpen.value = true
}

const closeLightbox = () => {
    lightboxOpen.value = false
    lightboxSrc.value = ''
}

// File content viewer state
const fileViewerOpen = ref(false)
const fileViewerName = ref('')
const fileViewerContent = ref('')

const openFileViewer = (fileName: string, content: string) => {
    fileViewerName.value = fileName
    fileViewerContent.value = content
    fileViewerOpen.value = true
}

const closeFileViewer = () => {
    fileViewerOpen.value = false
    fileViewerName.value = ''
    fileViewerContent.value = ''
}
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
            <div class="whitespace-normal flex flex-col gap-2">
                <!-- Text blocks first -->
                <template v-for="(block, bIndex) in userParsedBlocks" :key="'text-' + bIndex">
                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''" :asUser="true" />
                </template>

                <!-- Attachments section (images and files) -->
                <div v-if="userParsedBlocks.some(b => b.type === 'image' || b.type === 'file')"
                    class="flex flex-wrap gap-2 mt-1">
                    <template v-for="(block, bIndex) in userParsedBlocks" :key="'att-' + bIndex">
                        <!-- Image attachment card -->
                        <div v-if="block.type === 'image'" @click="openLightbox(block.src)"
                            class="attachment-card group/att relative w-16 h-16 rounded-lg overflow-hidden border border-white/20 bg-black/20 cursor-pointer hover:border-white/40 hover:scale-105 transition-all duration-200">
                            <img :src="block.src" class="w-full h-full object-cover" />
                            <div
                                class="absolute inset-0 bg-black/0 group-hover/att:bg-black/20 transition-all duration-200 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                                    stroke="currentColor"
                                    class="w-5 h-5 text-white opacity-0 group-hover/att:opacity-100 transition-opacity duration-200">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                                </svg>
                            </div>
                        </div>

                        <!-- File attachment card -->
                        <div v-else-if="block.type === 'file'"
                            @click="openFileViewer(block.fileName, block.fileContent)"
                            class="attachment-card group/att flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 bg-white/10 cursor-pointer hover:border-white/40 hover:bg-white/20 transition-all duration-200">
                            <div class="w-8 h-8 rounded bg-white/20 flex items-center justify-center flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    stroke-width="1.5" stroke="currentColor" class="w-5 h-5 opacity-80">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                            </div>
                            <div class="flex-1 min-w-0 max-w-[120px]">
                                <div class="text-xs font-medium truncate" :title="block.fileName">{{ block.fileName }}
                                </div>
                                <div class="text-xs opacity-60">点击查看</div>
                            </div>
                        </div>
                    </template>
                </div>
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

    <!-- Image Lightbox Modal -->
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="lightboxOpen" @click="closeLightbox"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out">
                <img :src="lightboxSrc" @click.stop
                    class="max-w-[90vw] max-h-[90vh] object-contain cursor-default rounded-lg shadow-2xl" />
                <button @click="closeLightbox"
                    class="absolute top-4 right-4 btn btn-ghost btn-circle text-white hover:bg-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                        stroke="currentColor" class="w-6 h-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </Transition>
    </Teleport>

    <!-- File Content Viewer Modal -->
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="fileViewerOpen" @click="closeFileViewer"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div @click.stop
                    class="bg-base-100 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden border border-base-300">
                    <!-- Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-200">
                        <div class="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                stroke="currentColor" class="w-5 h-5 opacity-60">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <span class="font-medium text-sm truncate max-w-[300px]" :title="fileViewerName">{{
                                fileViewerName }}</span>
                        </div>
                        <button @click="closeFileViewer" class="btn btn-ghost btn-sm btn-circle">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                                stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <!-- Content -->
                    <div class="flex-1 overflow-auto p-4 bg-base-300/30">
                        <pre
                            class="text-sm whitespace-pre-wrap break-words font-mono bg-base-100 rounded-lg p-4 border border-base-300">
                        <code>{{ fileViewerContent }}</code>
                    </pre>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
