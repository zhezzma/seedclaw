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

export const ensureFileExtension = (fileName: string, extension: string) => {
    return /\.[a-z0-9]+$/i.test(fileName) ? fileName : `${fileName}.${extension}`
}

export const shouldUseWebDownloadFallbackForUserAgent = (userAgent: string) => {
    const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
    const isAndroidWebView = /; wv\)/i.test(userAgent)

    return isIOS || isAndroidWebView
}
