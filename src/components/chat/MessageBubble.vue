<script setup lang="ts">
import {
    ClipboardIcon,
    SpeakerWaveIcon,
    StopIcon,
    TrashIcon,
    ArrowPathIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    PencilSquareIcon
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ToolInvocation from './ToolInvocation.vue'
import { A2UIRenderer } from '../a2ui'
import { handleA2UIAction } from '../../composables/useA2UIActions'
import { getSurface } from '../../composables/useA2UISurfaces'
import { useChatState } from '../../composables/useChatState'
import { useTTS } from '../../composables/useTTS'
import { useConfirm } from '../../composables/useConfirm'
import type { DisplayMessage } from '../../composables/useChatMessages'

export interface BranchInfo {
    siblings: string[]
    currentIndex: number
}

const props = defineProps<{
    message: DisplayMessage
    isLoading?: boolean
    isBusy?: boolean
    branchInfo?: BranchInfo | null
    /** 是否是最后一条消息，只有最后一条消息的 A2UI Surface 才允许交互 */
    isLastMessage?: boolean
}>()

const emit = defineEmits<{
    (e: 'copy', msg: DisplayMessage): void
    (e: 'read-aloud', msg: DisplayMessage): void
    (e: 'delete', msg: DisplayMessage): void
    (e: 'retry', msg: DisplayMessage): void
    (e: 'edit', msg: DisplayMessage, newText: string): void
    (e: 'navigate-branch', msg: DisplayMessage, direction: 'prev' | 'next'): void
}>()
const { t } = useI18n()
const chatState = useChatState()
const { currentReadingMsgId } = useTTS()
const { confirm } = useConfirm()

// A2UI action handling
function onA2UIAction(action: any, dataModel: Record<string, any>, surfaceId: string, sourceComponentId: string) {
    handleA2UIAction(action, dataModel, surfaceId, sourceComponentId)
}

// Edit state
const isEditing = ref(false)
const editText = ref('')

const startEdit = () => {
    // Extract text from user message blocks
    const text = (props.message.blocks || [])
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n')
    editText.value = text
    isEditing.value = true
}

const cancelEdit = () => {
    isEditing.value = false
    editText.value = ''
}

const submitEdit = () => {
    const newText = editText.value.trim()
    if (!newText) return
    isEditing.value = false
    emit('edit', props.message, newText)
}

const handleDelete = async () => {
    const result = await confirm(
        t('chat.deleteMessageConfirm'),
        t('chat.deleteMessageConfirmTitle')
    )
    if (result) {
        emit('delete', props.message)
    }
}

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

const getImageSrc = (source: any): string => {
    if (!source) return ''
    if (source.url) return source.url
    if (source.type === 'url' && source.data) return source.data
    const data = source.data || ''
    if (data.startsWith('data:') || data.startsWith('http')) return data
    if (data) return `data:${source.media_type || 'image/png'};base64,${data}`
    return ''
}

// 当前 Agent 信息直接从 chatState 获取，无需额外 watch 和查询
const currentAgent = computed(() => chatState.currentAgent)
const assistantName = computed(() => currentAgent.value?.identity?.name || currentAgent.value?.name || 'Assistant')
const assistantAvatar = computed(() => {
    const avatar = currentAgent.value?.avatar
    return isAvatarUrl(avatar) ? avatar : (currentAgent.value?.identity?.emoji || null)
})

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
        // Handle image blocks - build full URL or data URI
        else if (block.type === 'image') {
            result.push({
                type: 'image',
                src: getImageSrc(block.source)
            })
        }
        else {
            result.push(block)
        }
    }

    return result
})

const userImages = computed(() => {
    return userParsedBlocks.value.filter(b => b.type === 'image')
})

const userFiles = computed(() => {
    return userParsedBlocks.value.filter(b => b.type === 'file')
})

// Parse assistant message blocks to group consecutive images
const assistantParsedBlocks = computed(() => {
    if (props.message.role === 'user') return []
    const blocks = props.message.blocks || []
    const result = []
    let currentGallery: any = null

    for (const block of blocks) {
        if (block.type === 'image') {
            if (!currentGallery) {
                currentGallery = { type: 'image_gallery', images: [] }
                result.push(currentGallery)
            }
            currentGallery.images.push(block)
        } else {
            currentGallery = null
            result.push(block)
        }
    }
    return result
})

// Image lightbox state
const lightboxOpen = ref(false)
const lightboxSrc = ref('')

const imgScale = ref(1)
const imgTranslateX = ref(0)
const imgTranslateY = ref(0)
const isDragging = ref(false)

// Zoom & Pan state variables
let lastDistance = 0
let lastX = 0
let lastY = 0
let lastTap = 0
let isMouseDragging = ref(false)
let lastMouseX = 0
let lastMouseY = 0

const resetZoomState = () => {
    imgScale.value = 1
    imgTranslateX.value = 0
    imgTranslateY.value = 0
}

const openLightbox = (src: string) => {
    resetZoomState()
    lightboxSrc.value = src
    lightboxOpen.value = true
}

const closeLightbox = () => {
    lightboxOpen.value = false
    lightboxSrc.value = ''
    resetZoomState()
}

const getDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
}

const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
        lastDistance = getDistance(e.touches)
    } else if (e.touches.length === 1) {
        isDragging.value = true
        lastX = e.touches[0].clientX
        lastY = e.touches[0].clientY
    }
}

const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
        const currentDistance = getDistance(e.touches)
        const scaleChange = currentDistance / lastDistance
        imgScale.value = Math.min(Math.max(1, imgScale.value * scaleChange), 5)
        lastDistance = currentDistance
    } else if (e.touches.length === 1 && isDragging.value && imgScale.value > 1) {
        const currentX = e.touches[0].clientX
        const currentY = e.touches[0].clientY
        imgTranslateX.value += currentX - lastX
        imgTranslateY.value += currentY - lastY
        lastX = currentX
        lastY = currentY
    }
}

const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
        lastDistance = 0
    }
    if (e.touches.length === 0) {
        isDragging.value = false
        if (imgScale.value <= 1) {
            resetZoomState()
        }

        // Handle double tap
        const currentTime = new Date().getTime()
        const tapLength = currentTime - lastTap
        if (tapLength < 300 && tapLength > 0) {
            if (imgScale.value > 1) {
                resetZoomState()
            } else {
                imgScale.value = 2.5
            }
        }
        lastTap = currentTime
    }
}

const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const zoomIntensity = 0.1
    let newScale = imgScale.value + (e.deltaY < 0 ? -zoomIntensity : zoomIntensity)
    imgScale.value = Math.min(Math.max(1, newScale), 5)
    if (imgScale.value <= 1) {
        resetZoomState()
    }
}

const handleImageDblClick = (e: Event) => {
    e.stopPropagation()
    if (imgScale.value > 1) {
        resetZoomState()
    } else {
        imgScale.value = 2.5
    }
}

const handleMouseDown = (e: MouseEvent) => {
    e.stopPropagation()
    if (imgScale.value > 1) {
        isMouseDragging.value = true
        lastMouseX = e.clientX
        lastMouseY = e.clientY
    }
}

const handleMouseMove = (e: MouseEvent) => {
    if (isMouseDragging.value && imgScale.value > 1) {
        e.preventDefault()
        const currentX = e.clientX
        const currentY = e.clientY
        imgTranslateX.value += currentX - lastMouseX
        imgTranslateY.value += currentY - lastMouseY
        lastMouseX = currentX
        lastMouseY = currentY
    }
}

const handleMouseUp = (e: MouseEvent) => {
    if (isMouseDragging.value) {
        isMouseDragging.value = false
    }
}


const downloadImage = async (src: string, defaultName?: string) => {
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName || `image-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Download failed:', error);
        // Fallback
        const a = document.createElement('a');
        a.href = src;
        a.download = defaultName || `image-${Date.now()}.png`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
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
            {{ message.role === 'user' ? $t('chat.you') : assistantName }}
            <time v-if="message.timestamp" class="ml-1">{{ formatTime(message.timestamp) }}</time>
        </div>

        <!-- User Message Bubble -->
        <div v-if="message.role === 'user'" class="max-w-full chat-bubble bg-primary/10 text-base-content relative">
            <div class="whitespace-normal flex flex-col gap-2">
                <!-- Edit mode: textarea shown above invisible original content -->
                <textarea v-if="isEditing" v-model="editText" rows="4"
                    class="textarea textarea-bordered w-full bg-base-100 text-base-content text-sm resize-y min-h-[80px]"
                    @keydown.ctrl.enter="submitEdit" />
                <!-- Original content: visible normally, invisible (but still in layout) when editing to preserve width -->
                <div :class="{ 'invisible h-0 overflow-hidden': isEditing }">
                    <!-- Text blocks first -->
                    <template v-for="(block, bIndex) in userParsedBlocks" :key="'text-' + bIndex">
                        <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''" />
                        
                        <!-- NEW: A2UI Action Block -->
                        <div v-else-if="block.type === 'a2ui-action'" class="my-1 min-w-[240px] max-w-sm">
                            <div class="collapse collapse-arrow border border-base-content/10 bg-base-100/50 backdrop-blur-sm shadow-sm rounded-lg">
                                <input type="checkbox" />
                                <div class="collapse-title p-2 min-h-0 flex items-center gap-2">
                                    <span class="text-lg opacity-80">⚡</span>
                                    <div class="flex flex-col flex-1 min-w-0 pr-2">
                                        <span class="text-[10px] font-semibold text-base-content/50 uppercase tracking-wider">{{ $t('chat.a2uiAction') }}</span>
                                        <span class="text-sm font-medium text-base-content/90 truncate">{{ block.a2uiEventName }}</span>
                                    </div>
                                </div>
                                <div class="collapse-content p-0 pb-2 px-3 cursor-text">
                                    <pre class="text-[11px] leading-tight bg-base-200/50 p-2 rounded overflow-x-auto text-base-content/70 whitespace-pre-wrap max-h-60 overflow-y-auto">{{ JSON.stringify(block.a2uiPayload, null, 2) }}</pre>
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- File attachments section -->
                    <div v-if="userFiles.length > 0" class="flex flex-wrap gap-2 mt-1">
                        <template v-for="(block, bIndex) in userFiles" :key="'file-' + bIndex">
                            <div @click="openFileViewer(block.fileName, block.fileContent)"
                                class="attachment-card group/att flex items-center gap-2 px-3 py-2 rounded-lg border border-base-content/30 bg-white/10 cursor-pointer hover:border-base-content/50 hover:bg-white/20 transition-all duration-200">
                                <div class="w-8 h-8 rounded bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                        stroke-width="1.5" stroke="currentColor" class="w-5 h-5 opacity-80">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                </div>
                                <div class="flex-1 min-w-0 max-w-[120px]">
                                    <div class="text-xs font-medium truncate" :title="block.fileName">{{ block.fileName
                                        }}
                                    </div>
                                    <div class="text-xs opacity-60">{{ $t('common.clickToView') }}</div>
                                </div>
                            </div>
                        </template>
                    </div>

                    <!-- Image attachments section -->
                    <div v-if="userImages.length > 0" class="grid gap-2 mt-1 w-fit" :class="{
                        'grid-cols-1': userImages.length === 1,
                        'grid-cols-2 max-w-[240px] sm:max-w-[320px]': userImages.length === 2 || userImages.length === 4,
                        'grid-cols-3 max-w-[360px] sm:max-w-[480px]': userImages.length === 3 || userImages.length > 4
                    }">
                        <div v-for="(imgBlock, bIndex) in userImages" :key="'img-' + bIndex"
                            @click="openLightbox(imgBlock.src)"
                            class="attachment-card group/att relative rounded-lg overflow-hidden border border-white/20 bg-black/20 cursor-pointer hover:border-white/40 transition-all duration-200"
                            :class="userImages.length > 1 ? 'aspect-square' : ''">
                            <img :src="imgBlock.src" class="w-full h-full"
                                :class="userImages.length === 1 ? 'max-w-full max-h-[300px] object-contain bg-white/10 flex-none' : 'object-cover'" />
                            <!-- Hover overlay -->
                            <div
                                class="absolute inset-0 bg-black/0 group-hover/att:bg-black/20 transition-all duration-200 flex items-center justify-center pointer-events-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                                    stroke="currentColor"
                                    class="w-6 h-6 text-white opacity-0 group-hover/att:opacity-100 transition-opacity duration-200">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                                </svg>
                            </div>
                            <!-- Download Button -->
                            <button @click.stop="downloadImage(imgBlock.src)"
                                class="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white backdrop-blur-sm border border-white/20 hover:bg-black/60 md:opacity-0 group-hover/att:opacity-100 transition-opacity z-10"
                                :title="$t('chat.downloadImage')">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                                    stroke="currentColor" class="w-4 h-4">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- User Actions (Hover) -->
        <div v-if="message.role === 'user'"
            class="chat-footer  transition-all duration-200 mt-1 flex items-center gap-1">
            <!-- Edit mode: show cancel & update -->
            <template v-if="isEditing">
                <button @click="cancelEdit" class="btn btn-ghost btn-sm text-base-content/60">
                    {{ $t('common.cancel') }}
                </button>
                <button @click="submitEdit" :disabled="!editText.trim()" class="btn btn-sm btn-primary">
                    {{ $t('chat.editUpdate') }}
                </button>
            </template>
            <!-- Normal mode: show action buttons -->
            <template v-else>
                <button @click="emit('copy', message)"
                    class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                    :title="$t('common.copy')">
                    <ClipboardIcon class="h-4 w-4" />
                </button>
                <button v-if="!isBusy && message.entryId" @click="startEdit"
                    class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-info hover:bg-info/10"
                    :title="$t('common.edit')">
                    <PencilSquareIcon class="h-4 w-4" />
                </button>
                <button v-if="!isBusy && message.entryId" @click="handleDelete"
                    class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-error hover:bg-error/10"
                    :title="$t('common.delete')">
                    <TrashIcon class="h-4 w-4" />
                </button>
                <button v-if="!isBusy && message.entryId" @click="emit('retry', message)"
                    class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-warning hover:bg-warning/10"
                    :title="$t('chat.retry')">
                    <ArrowPathIcon class="h-4 w-4" />
                </button>
            </template>
        </div>

        <!-- Assistant Message Bubble -->
        <div v-else class="max-w-full md:max-w-[90%]  w-full chat-bubble   relative">
            <div class="whitespace-normal flex flex-col gap-2">
                <!-- Loading indicator if empty or just waiting -->
                <div v-if="isLoading && (!message.blocks.length || (message.blocks.length === 1 && message.blocks[0].type === 'text' && !message.blocks[0].text))"
                    class="loading loading-dots loading-sm opacity-50 "></div>
                <template v-else v-for="(block, bIndex) in assistantParsedBlocks" :key="bIndex">
                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ``" />
                    <ToolInvocation v-else-if="block.type === 'tool'" :toolName="block.toolName || 'Unknown Tool'"
                        :args="block.toolArgs || {}" :result="block.toolResult" :state="block.toolState"
                        :errorMessage="block.toolError" :details="block.toolDetails" />
                    <!-- A2UI 组件渲染 -->
                    <A2UIRenderer
                        v-else-if="block.type === 'a2ui' && block.a2uiComponents && block.a2uiSurfaceId"
                        :components="block.a2uiComponents"
                        :data-model="getSurface(block.a2uiSurfaceId)?.dataModel || {}"
                        :root-ids="block.a2uiRootIds"
                        :disabled="!isLastMessage"
                        class="my-2"
                        @action="(action: any, dm: any, sourceId: string) => onA2UIAction(action, dm, block.a2uiSurfaceId, sourceId)"
                    />
                    <!-- A2UI 加载中（流式接收，标签未闭合） -->
                    <div v-else-if="block.type === 'a2ui_loading'" class="my-2">
                        <div class="collapse collapse-arrow border border-base-300 bg-base-100 rounded-box">
                            <input type="checkbox" />
                            <div class="collapse-title text-sm font-medium opacity-70 flex items-center gap-2">
                                <span class="loading loading-spinner loading-xs"></span>
                                {{ $t('chat.a2ui_loading') }}
                            </div>
                            <div class="collapse-content">
                                <div class="opacity-50 text-xs font-mono border-t border-base-300 pt-2 mt-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">{{ block.text }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-else-if="block.type === 'image_gallery'" class="grid gap-2 my-1 w-fit" :class="{
                        'grid-cols-1': block.images.length === 1,
                        'grid-cols-2 max-w-[240px] sm:max-w-[320px]': block.images.length === 2 || block.images.length === 4,
                        'grid-cols-3 max-w-[360px] sm:max-w-[480px]': block.images.length === 3 || block.images.length > 4
                    }">
                        <div v-for="(imgBlock, i) in block.images" :key="i"
                            class="rounded-lg overflow-hidden border border-base-300 cursor-pointer relative group/att"
                            :class="block.images.length > 1 ? 'aspect-square' : ''"
                            @click="openLightbox(getImageSrc(imgBlock.source))">
                            <img :src="getImageSrc(imgBlock.source)" class="w-full h-full"
                                :class="block.images.length === 1 ? 'max-w-full max-h-[300px] object-contain flex-none' : 'object-cover'" />
                            <div
                                class="absolute inset-0 bg-base-content/0 group-hover/att:bg-base-content/10 transition-all duration-200 flex items-center justify-center pointer-events-none">
                            </div>
                            <!-- Download Button -->
                            <button @click.stop="downloadImage(getImageSrc(imgBlock.source))"
                                class="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white backdrop-blur-sm border border-white/20 hover:bg-black/60 md:opacity-0 group-hover/att:opacity-100 transition-opacity z-10"
                                :title="$t('chat.downloadImage')">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                                    stroke="currentColor" class="w-4 h-4">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div v-else-if="block.type === 'thinking' && !currentAgent?.hideThinkingBlock" class="my-2">
                        <div class="collapse collapse-arrow border border-base-300 bg-base-100 rounded-box">
                            <input type="checkbox" />
                            <div class="collapse-title text-sm font-medium opacity-70 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                                </svg>
                                {{ $t('chat.reasoning') }}
                            </div>
                            <div class="collapse-content">
                                <div class="opacity-80 text-sm border-t border-base-300 pt-2 mt-2">
                                    <MarkdownRenderer :content="block.text || ''" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-else-if="block.type === 'unknown'" class="alert alert-warning text-xs p-2 my-1">
                        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none"
                            viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Unknown block type: {{ block.text }}</span>
                    </div>
                    <div v-else-if="block.type === 'error'"
                        class="alert alert-error text-xs p-2 my-1 flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-5 w-5 mt-0.5"
                            fill="none" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div class="flex-1">
                            <div class="font-bold">{{ $t('common.error') }}</div>
                            <div class="whitespace-pre-wrap">{{ block.error }}</div>
                        </div>
                    </div>
                </template>
            </div>
        </div>
        <!-- Assistant Actions (Fixed) -->
        <div v-if="message.role !== 'user'" class="chat-footer mt-1 flex items-center gap-1">
            <button @click="emit('copy', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                :title="$t('common.copy')">
                <ClipboardIcon class="h-4 w-4" />
            </button>
            <button @click="emit('read-aloud', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                :class="{ 'bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-700': currentReadingMsgId === message.id }"
                :title="$t('chat.readAloud')">
                <template v-if="currentReadingMsgId === message.id">
                    <StopIcon class="h-4 w-4" />
                </template>
                <template v-else>
                    <SpeakerWaveIcon class="h-4 w-4" />
                </template>
            </button>
            <button v-if="!isBusy && message.entryId" @click="handleDelete"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-error hover:bg-error/10"
                :title="$t('common.delete')">
                <TrashIcon class="h-4 w-4" />
            </button>
            <button v-if="!isBusy && message.entryId" @click="emit('retry', message)"
                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-warning hover:bg-warning/10"
                :title="$t('chat.retry')">
                <ArrowPathIcon class="h-4 w-4" />
            </button>

            <!-- Branch Navigation -->
            <div v-if="branchInfo && branchInfo.siblings.length > 1" class="flex items-center gap-0.5 ml-1">
                <button @click="emit('navigate-branch', message, 'prev')" :disabled="branchInfo.currentIndex <= 0"
                    class="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-primary hover:bg-base-200 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeftIcon class="h-3.5 w-3.5" />
                </button>
                <span class="text-xs text-base-content/50 min-w-[2rem] text-center select-none">
                    {{ branchInfo.currentIndex + 1 }}/{{ branchInfo.siblings.length }}
                </span>
                <button @click="emit('navigate-branch', message, 'next')"
                    :disabled="branchInfo.currentIndex >= branchInfo.siblings.length - 1"
                    class="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-primary hover:bg-base-200 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRightIcon class="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    </div>

    <!-- Image Lightbox Modal -->
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="lightboxOpen" @click.self="closeLightbox"
                class="fixed inset-0 z-50 bg-black/95 backdrop-blur-md overflow-hidden flex items-center justify-center touch-none"
                @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">

                <div class="relative w-full h-full flex items-center justify-center p-2 sm:p-4"
                    @click.self="closeLightbox">
                    <img :src="lightboxSrc" @touchstart="handleTouchStart" @touchmove.prevent="handleTouchMove"
                        @touchend="handleTouchEnd" @touchcancel="handleTouchEnd" @mousedown="handleMouseDown"
                        @wheel="handleWheel" @dblclick="handleImageDblClick" @click.stop :style="{
                            transform: `translate(${imgTranslateX}px, ${imgTranslateY}px) scale(${imgScale})`,
                            transition: isDragging || isMouseDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                        }" class="max-w-[100vw] max-h-[100vh] object-contain shadow-2xl select-none"
                        :class="imgScale > 1 ? 'cursor-move' : 'cursor-zoom-in'" draggable="false" />
                </div>

                <!-- Tools -->
                <div class="fixed top-4 right-4 flex items-center gap-2 z-[60]">
                    <!-- Download -->
                    <button @click.stop="downloadImage(lightboxSrc)"
                        class="btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                        :title="$t('chat.downloadImage')">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                            stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                    </button>
                    <!-- Close -->
                    <button @click.stop="closeLightbox"
                        class="btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                        :title="$t('common.close')">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                            stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Hint string at bottom -->
                <div v-if="imgScale === 1"
                    class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white/90 px-4 py-1.5 rounded-full text-xs backdrop-blur-md pointer-events-none z-[60]">
                    {{ $t('chat.zoomHint') }}
                </div>
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

@media (max-width: 768px) {
    .chat {
        column-gap: 0 !important;
    }

    .chat-bubble::before {
        display: none !important;
    }
}
</style>
