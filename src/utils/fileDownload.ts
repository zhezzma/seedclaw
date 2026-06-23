import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'

/**
 * 文件 / 图片下载共用工具：
 * - 文件名 / 扩展名归一：getImageExtension / ensureFileExtension
 * - WebView 下载兜底判定：shouldUseWebDownloadFallbackForUserAgent
 * - 落盘 / 触发下载：saveBlob
 *   - Tauri：写入系统 Download 目录（Android 走 Home/Download）
 *   - 浏览器：创建 <a download> 锚点触发；iOS/Android WebView 退回 location.href
 *   返回落盘的目标描述（path），供调用方做 toast 提示。
 */

/** MIME → 图片扩展名。image/jpeg 归一为 jpg；非图片或无法解析返回 bin。 */
export const getImageExtension = (mimeType: string) => {
    if (mimeType === 'image/jpeg') return 'jpg'

    if (mimeType.startsWith('image/')) {
        const subtype = mimeType.slice('image/'.length).split(';', 1)[0].trim().toLowerCase()
        const normalizedSubtype = subtype.split('+', 1)[0]

        if (/^[a-z0-9.-]+$/i.test(normalizedSubtype) && normalizedSubtype.length > 0) {
            return normalizedSubtype
        }
    }

    return 'bin'
}

/** 文件名已带扩展名则原样返回，否则补上给定扩展名。 */
export const ensureFileExtension = (fileName: string, extension: string) => {
    return /\.[a-z0-9]+$/i.test(fileName) ? fileName : `${fileName}.${extension}`
}

/** iOS / Android WebView 下 <a download> 不可靠，需退回 location.href 兜底。 */
export const shouldUseWebDownloadFallbackForUserAgent = (userAgent: string) => {
    const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
    const isAndroidWebView = /; wv\)/i.test(userAgent)

    return isIOS || isAndroidWebView
}

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
