import type { DisplayBlock, DisplayMessage } from '../composables/useChatMessages.ts'
import { createMarkdownItInstance } from './markdown/markdown-config.ts'
import { resolveMediaUrl } from './media-url.ts'

const galleryMarkdown = createMarkdownItInstance()

type MarkdownTokenLike = {
    type: string
    content: string
    children?: MarkdownTokenLike[] | null
    attrGet: (name: string) => string | null
}

const extractMarkdownImageSources = (text: string): string[] => {
    const sources: string[] = []

    const visit = (tokens: MarkdownTokenLike[]) => {
        for (const token of tokens) {
            if (token.type === 'image') {
                const source = token.attrGet('src')
                if (source) sources.push(source)
            }

            if (token.children) visit(token.children)
        }
    }

    visit(galleryMarkdown.parse(text || '', {}) as MarkdownTokenLike[])
    return sources
}

const getStructuredImageSource = (
    source: DisplayBlock['source'],
    apiBaseUrl: string,
): string => {
    if (!source) return ''

    const url = source.url || (source.type === 'url' ? source.data : '')
    if (url) return resolveMediaUrl(url, apiBaseUrl) || ''

    const data = source.data || ''
    if (!data) return ''
    if (data.startsWith('data:') || /^https?:\/\//i.test(data)) return data

    return `data:${source.media_type || 'image/png'};base64,${data}`
}

export const collectSessionImageSources = (
    messages: DisplayMessage[],
    apiBaseUrl: string,
): string[] => {
    const result: string[] = []
    const seen = new Set<string>()

    const append = (source: string | undefined) => {
        const resolved = resolveMediaUrl(source, apiBaseUrl) || ''
        if (!resolved || seen.has(resolved)) return
        seen.add(resolved)
        result.push(resolved)
    }

    for (const message of messages) {
        for (const block of message.blocks || []) {
            if (block.type === 'image') {
                append(getStructuredImageSource(block.source, apiBaseUrl))
                continue
            }

            if ((block.type === 'text' || block.type === 'thinking') && block.text) {
                for (const source of extractMarkdownImageSources(block.text)) {
                    append(source)
                }
            }
        }
    }

    return result
}
