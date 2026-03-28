<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMediaPreview } from '../../composables/useMediaPreview'

const { t } = useI18n()

const {
    lightboxOpen,
    lightboxSrc,
    imgScale,
    imgTranslateX,
    imgTranslateY,
    isDragging,
    isMouseDragging,
    closeLightbox,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel,
    handleImageDblClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    downloadImage,
    fileViewerOpen,
    fileViewerName,
    fileViewerContent,
    closeFileViewer,
} = useMediaPreview()
</script>

<template>
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
                        :class="imgScale > 1 ? 'cursor-move' : ''" draggable="false" />
                </div>

                <!-- Tools -->
                <div class="fixed top-4 right-4 flex items-center gap-2 z-[60]">
                    <!-- Download -->
                    <button @click.stop="downloadImage(lightboxSrc)"
                        class="btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                        :title="t('chat.downloadImage')">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                            stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                    </button>
                    <!-- Close -->
                    <button @click.stop="closeLightbox"
                        class="btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                        :title="t('common.close')">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                            stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Hint string at bottom -->
                <div v-if="imgScale === 1"
                    class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white/90 px-4 py-1.5 rounded-full text-xs backdrop-blur-md pointer-events-none z-[60]">
                    {{ t('chat.zoomHint') }}
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
</style>
