/**
 * Utility functions for text processing, specifically for TTS (Text-to-Speech)
 */

// Maximum characters per TTS request (conservative limit for Edge TTS / common APIs)
export const MAX_TTS_CHARS = 2500

// Punctuation marks that are good for splitting sentences
const SENTENCE_BREAKS = ['.', '?', '!', '。', '？', '！', '\n', ';', '；']
// Secondary breaks if sentence breaks aren't found
const PHRASE_BREAKS = [',', '，', ':', '：', ' ', '\t']

/**
 * Clean text for TTS - remove content that shouldn't be spoken
 */
export function cleanTextForTTS(text: string): string {
    if (!text) return ''

    let cleaned = text

    // 1. Remove code blocks ```...```
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '')

    // 2. Remove inline code `...`
    cleaned = cleaned.replace(/`[^`]+`/g, '')

    // 3. Remove markdown links [text](url) -> keep text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // 4. Remove markdown images ![alt](url)
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]+\)/g, '')

    // 5. Remove markdown emphasis markers (**, *, __, _)
    cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2')  // bold
    cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2')     // italic

    // 6. Remove markdown headers # ## ### etc
    cleaned = cleaned.replace(/^#{1,6}\s*/gm, '')

    // 7. Remove horizontal rules --- *** ___
    cleaned = cleaned.replace(/^[-*_]{3,}\s*$/gm, '')

    // 8. Remove kaomoji/emoticons and complex symbols
    // Common patterns: (xxx), （xxx）, ╮(╯▽╰)╭, etc.
    // Using a broad range of symbols often found in kaomoji or decorative text
    cleaned = cleaned.replace(/[（(][^)（）]*[◡╯╰▽□°・ω＾≧≦><╮╭ヾo○●◎★☆♪♫♬♡❤❥→←↑↓↔↕⇐⇒⇑⇓∀∂∃∅∇∈∋∏∑√∝∞∟∠∣∥∧∨∩∪∫∬∭∮∯∰∱∲∳][^)（）]*[)）]/g, '')

    // 9. Remove standalone special symbols often used decoratively
    cleaned = cleaned.replace(/[~～♪♫♬★☆✦✧❤♡❥→←↑↓⇐⇒●○◎◆◇□■△▲▽▼※✿❀❁❂❃❄❅❆]/g, '')

    // 10. Remove excessive punctuation (more than 2 in a row)
    cleaned = cleaned.replace(/([!?！？~～。，、]){3,}/g, '$1$1')

    // 11. Remove multiple spaces/newlines
    cleaned = cleaned.replace(/\s+/g, ' ')

    // 12. Trim
    cleaned = cleaned.trim()

    return cleaned
}

/**
 * Split long text into chunks that fit within the maximum character limit.
 * Tries to split at sentence boundaries first, then phrase boundaries.
 * 
 * @param text The text to split
 * @param maxLength Maximum length of each chunk
 * @returns Array of text chunks
 */
export function splitText(text: string, maxLength: number = MAX_TTS_CHARS): string[] {
    if (!text) return []
    if (text.length <= maxLength) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining)
            break
        }

        // Find the best split point within the limit
        let splitIndex = -1
        const searchRange = remaining.substring(0, maxLength)

        // 1. Try sentence breaks (prioritize finding the last one within range)
        for (const char of SENTENCE_BREAKS) {
            const index = searchRange.lastIndexOf(char)
            if (index > splitIndex) {
                splitIndex = index
            }
        }

        // 2. If no sentence break, try phrase breaks
        if (splitIndex === -1) {
            for (const char of PHRASE_BREAKS) {
                const index = searchRange.lastIndexOf(char)
                if (index > splitIndex) {
                    splitIndex = index
                }
            }
        }

        // 3. If still no break found (extremely long word/sentence), hard split
        if (splitIndex === -1) {
            splitIndex = maxLength - 1
        }

        // Include the split character in the first chunk (e.g., "Hello." -> "Hello." + " World")
        // But if we split at space, we might want to trim.
        // For simplicity, we cut AT splitIndex + 1 to include the punctuation.
        const cutLength = splitIndex + 1

        chunks.push(remaining.substring(0, cutLength).trim())
        remaining = remaining.substring(cutLength).trim()
    }

    return chunks
}
