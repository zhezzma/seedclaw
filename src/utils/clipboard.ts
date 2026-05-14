const buildClipboardTextPayload = (text: string) => text.replace(/^\uFEFF/, '')

export const writeClipboard = (text: string) => navigator.clipboard.writeText(buildClipboardTextPayload(text))
