import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'
import { shouldUseWebDownloadFallbackForUserAgent } from './mediaDownload'

/**
 * 把 Blob 落盘 / 触发下载。与 useMediaPreview 的图片下载同源逻辑，
 * 抽出来供任意文件下载复用：
 * - Tauri：写入系统 Download 目录（Android 走 Home/Download）
 * - 浏览器：创建 <a download> 锚点触发；iOS/Android WebView 退回 location.href
 *
 * 返回落盘的目标描述（path），供调用方做 toast 提示。
 */

const isTauriApp = () => {
    if (typeof window === 'undefined') return false
    return !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
}

const isAndroidTauri = () => {
    if (typeof navigator === 'undefined') return false
    return isTauriApp() && /Android/i.test(navigator.userAgent)
}

const getTauriDownloadTarget = (fileName: string) => {
    if (isAndroidTauri()) {
        return { path: `Download/${fileName}`, baseDir: BaseDirectory.Home }
    }
    return { path: fileName, baseDir: BaseDirectory.Download }
}

const shouldUseWebDownloadFallback = () => {
    if (typeof navigator === 'undefined') return false
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

/** 落盘 Blob，返回保存路径（供 toast）。Tauri 写 Download 目录，浏览器走锚点下载。 */
export async function saveBlob(blob: Blob, fileName: string): Promise<string> {
    if (isTauriApp()) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const target = getTauriDownloadTarget(fileName)
        await writeFile(target.path, bytes, { baseDir: target.baseDir })
        return target.path
    }
    downloadBlobInBrowser(blob, fileName)
    return fileName
}
