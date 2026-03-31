import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'
import { ref } from 'vue'
import { ensureFileExtension, getImageExtension, shouldUseWebDownloadFallbackForUserAgent } from '../utils/mediaDownload'
import { useToast } from './useToast'

// ==================== Image Lightbox State ====================

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
// Mobile Safari / Chromium may emit a synthetic dblclick right after a touch double tap.
// Track the touch-driven zoom time so we can ignore that follow-up event without affecting desktop dblclick.
let lastTouchDoubleTapAt = 0
const isMouseDragging = ref(false)
let lastMouseX = 0
let lastMouseY = 0

const resetZoomState = () => {
    imgScale.value = 1
    imgTranslateX.value = 0
    imgTranslateY.value = 0
}

const toggleZoom = () => {
    if (imgScale.value > 1) {
        resetZoomState()
    } else {
        imgScale.value = 2.5
    }
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
        const currentTime = Date.now()
        const tapLength = currentTime - lastTap
        if (tapLength < 300 && tapLength > 0) {
            toggleZoom()
            lastTouchDoubleTapAt = currentTime
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

    // Ignore the synthetic dblclick some mobile browsers dispatch immediately
    // after touch-based double tap, otherwise the zoom toggles twice and flickers.
    if (Date.now() - lastTouchDoubleTapAt < 350) {
        return
    }

    toggleZoom()
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

const handleMouseUp = (_e: MouseEvent) => {
    if (isMouseDragging.value) {
        isMouseDragging.value = false
    }
}

const isTauriApp = () => {
    if (typeof window === 'undefined') {
        return false
    }

    return !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
}

const isAndroidTauri = () => {
    if (typeof navigator === 'undefined') return false
    return isTauriApp() && /Android/i.test(navigator.userAgent)
}

const getTauriDownloadTarget = (fileName: string) => {
    if (isAndroidTauri()) {
        return {
            path: `Download/${fileName}`,
            baseDir: BaseDirectory.Home,
        }
    }

    return {
        path: fileName,
        baseDir: BaseDirectory.Download,
    }
}

const shouldUseWebDownloadFallback = () => {
    if (typeof navigator === 'undefined') {
        return false
    }

    return shouldUseWebDownloadFallbackForUserAgent(navigator.userAgent || '')
}

const downloadBlobInBrowser = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob)

    if (shouldUseWebDownloadFallback()) {
        window.location.href = url
        setTimeout(() => window.URL.revokeObjectURL(url), 30000)
        return
    }

    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => window.URL.revokeObjectURL(url), 5000)
}

const downloadImage = async (src: string, defaultName?: string) => {
    const toast = useToast()
    const { i18n } = await import('../i18n')
    const _t = (key: string, named?: Record<string, unknown>) => named ? i18n.global.t(key, named) : i18n.global.t(key)

    try {
        const response = await fetch(src)
        const blob = await response.blob()
        const extension = getImageExtension(blob.type)
        const fileName = ensureFileExtension(defaultName || `image-${Date.now()}`, extension)

        if (isTauriApp()) {
            const bytes = new Uint8Array(await blob.arrayBuffer())
            const target = getTauriDownloadTarget(fileName)
            await writeFile(target.path, bytes, { baseDir: target.baseDir })
            toast.success(_t('chat.downloadImageSuccess', { path: target.path }))
            return
        }

        downloadBlobInBrowser(blob, fileName)
        toast.success(_t('chat.downloadImageSuccess', { path: fileName }))
    } catch (error) {
        console.error('Download failed:', error)
        toast.error(_t('chat.downloadImageFailed'))
    }
}

const copyImageToClipboard = async (src: string) => {
    const toast = useToast()
    const { i18n } = await import('../i18n')
    const _t = (key: string) => i18n.global.t(key)
    try {
        const response = await fetch(src)
        const blob = await response.blob()

        // The Clipboard API requires image/png. Convert if needed.
        let pngBlob = blob
        if (blob.type !== 'image/png') {
            pngBlob = await convertToPng(blob)
        }

        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
        ])
        toast.success(_t('common.copied'))
    } catch (error) {
        console.error('Copy image failed:', error)
        toast.error(_t('chat.copyImageFailed'))
    }
}

const convertToPng = (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            canvas.toBlob(b => {
                if (b) resolve(b)
                else reject(new Error('Canvas toBlob failed'))
            }, 'image/png')
        }
        img.onerror = reject
        img.src = URL.createObjectURL(blob)
    })
}

// ==================== File Content Viewer State ====================

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

// ==================== Export (singleton) ====================

const _mediaPreviewState = {
    // Image lightbox
    lightboxOpen,
    lightboxSrc,
    imgScale,
    imgTranslateX,
    imgTranslateY,
    isDragging,
    isMouseDragging,
    openLightbox,
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
    copyImageToClipboard,
    // File viewer
    fileViewerOpen,
    fileViewerName,
    fileViewerContent,
    openFileViewer,
    closeFileViewer,
}

export function useMediaPreview() {
    return _mediaPreviewState
}
