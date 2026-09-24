<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { MinusIcon, Square2StackIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { Window as TauriWindow } from '@tauri-apps/api/window'

// 仅桌面端 Tauri 渲染：移动端无窗口装饰概念，浏览器环境无窗口 API
const isTauriApp = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
const visible = isTauriApp && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

// 最大化状态跟随窗口 resize 事件同步（启动即 maximized，靠初始读取对齐图标）
const isMaximized = ref(false)
let win: TauriWindow | null = null
let unlistenResize: (() => void) | null = null

onMounted(async () => {
    if (!visible) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    win = getCurrentWindow()
    try {
        isMaximized.value = await win.isMaximized()
        unlistenResize = await win.onResized(async () => {
            isMaximized.value = await win!.isMaximized()
        })
    } catch (e) {
        console.error('[window-controls] init failed', e)
    }
})

onUnmounted(() => {
    unlistenResize?.()
    unlistenResize = null
})

const onMinimize = () => { void win?.minimize() }
// 双击顶栏的最大化/还原由 Tauri 内置 drag-region 脚本处理，这里只响应按钮点击
const onToggleMaximize = () => { void win?.toggleMaximize() }
// 关闭复用 Rust 侧 CloseRequested → 隐藏到托盘的既有语义
const onClose = () => { void win?.close() }

const btnClass = 'w-12 h-full grid place-items-center text-base-content/70 hover:bg-base-300/60 transition-colors cursor-pointer'
const closeClass = ' hover:bg-red-600 hover:text-white'
</script>

<template>
    <!-- 悬浮窗口键组：右上角，与页面顶栏（ViewHeader min-h-[3rem]）同高。
         拖拽窗口/双击最大化由 ViewHeader / AppSidebar 头部的 drag region 承担，这里只放三颗键 -->
    <div v-if="visible" class="fixed top-0 right-0 z-30 h-12 flex items-stretch select-none">
        <button :class="btnClass" aria-label="Minimize" @click="onMinimize">
            <MinusIcon class="w-4 h-4" />
        </button>
        <button :class="btnClass" :aria-label="isMaximized ? 'Restore' : 'Maximize'" @click="onToggleMaximize">
            <Square2StackIcon v-if="isMaximized" class="w-4 h-4" />
            <span v-else class="w-2.5 h-2.5 border border-current"></span>
        </button>
        <button :class="btnClass + closeClass" aria-label="Close" @click="onClose">
            <XMarkIcon class="w-4 h-4" />
        </button>
    </div>
</template>
