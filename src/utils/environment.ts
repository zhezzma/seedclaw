/**
 * 桌面端 Tauri 运行环境：有 Tauri 注入对象且非移动 UA。
 * 窗口装饰类能力（悬浮窗口键、标题栏 drag region）仅此环境渲染；
 * 移动端 Tauri（App WebView）与普通浏览器均不满足。
 */
export const isDesktopTauri = (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__)
    && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
