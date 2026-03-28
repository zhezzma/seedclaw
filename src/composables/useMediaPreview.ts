import { ref } from 'vue'

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
const isMouseDragging = ref(false)
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

const handleMouseUp = (_e: MouseEvent) => {
    if (isMouseDragging.value) {
        isMouseDragging.value = false
    }
}

const downloadImage = async (src: string, defaultName?: string) => {
    try {
        const response = await fetch(src)
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = defaultName || `image-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
    } catch (error) {
        console.error('Download failed:', error)
        const a = document.createElement('a')
        a.href = src
        a.download = defaultName || `image-${Date.now()}.png`
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }
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
