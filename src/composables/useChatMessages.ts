import { computed, watch, nextTick, ref, type Ref } from 'vue'
import { useGatewayStore } from '../stores/gateway'

// Types for internal display
export interface DisplayBlock {
    type: 'text' | 'tool' | 'image' | 'file'
    text?: string
    toolCallId?: string
    toolName?: string
    toolArgs?: any
    toolResult?: any
    toolState?: 'calling' | 'success' | 'error'
    toolError?: string
    source?: {
        type: 'base64' | 'url'
        media_type?: string
        data?: string
        name?: string
    }
}

export interface DisplayMessage {
    id: string
    role: 'user' | 'assistant'
    blocks: DisplayBlock[]
    timestamp?: number
}

export function useChatMessages(messagesContainerRef: Ref<HTMLDivElement | null>) {
    const gatewayStore = useGatewayStore()

    // Transform raw messages into display messages with merged tool results
    const processedMessages = computed(() => {
        const rawMessages = gatewayStore.chatMessages as any[]
        const displayMessages: DisplayMessage[] = []

        // map toolCallId -> { messageIndex, blockIndex }
        const toolCallRegistry = new Map<string, { msgIdx: number, blockIdx: number }>()

        for (const msg of rawMessages) {
            if (msg.role === 'toolResult') {
                // Find corresponding tool call and update it
                const reg = toolCallRegistry.get(msg.toolCallId)
                if (reg) {
                    const targetMsg = displayMessages[reg.msgIdx]
                    if (targetMsg) {
                        const targetBlock = targetMsg.blocks[reg.blockIdx]
                        if (targetBlock && targetBlock.type === 'tool') {
                            targetBlock.toolResult = msg.content

                            // Simple error detection logic
                            let isError = false
                            let errorMsg = ''

                            if (msg.isError) {
                                isError = true
                                errorMsg = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                            } else if (msg.details?.status === 'error') {
                                isError = true
                                errorMsg = msg.details.error || 'Unknown error'
                            }

                            targetBlock.toolState = isError ? 'error' : 'success'
                            targetBlock.toolError = errorMsg
                        }
                    }
                }
                continue
            }

            const blocks: DisplayBlock[] = []
            // Determine if we should merge with the previous message
            const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
            const shouldMerge = lastMsg && lastMsg.role === 'assistant' && msg.role === 'assistant'

            const targetMsgIdx = shouldMerge ? displayMessages.length - 1 : displayMessages.length
            const baseBlockIdx = shouldMerge ? lastMsg.blocks.length : 0

            if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    if (item.type === 'text') {
                        if (item.text) blocks.push({ type: 'text', text: item.text })
                    } else if (item.type === 'toolCall') {
                        blocks.push({
                            type: 'tool',
                            toolCallId: item.id,
                            toolName: item.name,
                            toolArgs: item.arguments,
                            toolState: 'calling'
                        })
                        // Register location
                        toolCallRegistry.set(item.id, { msgIdx: targetMsgIdx, blockIdx: baseBlockIdx + blocks.length - 1 })
                    } else if (item.type === 'image') {
                        blocks.push({
                            type: 'image',
                            source: item.source
                        })
                    } else if (item.type === 'file') {
                        blocks.push({
                            type: 'file',
                            source: item.source,
                            text: item.text // Optional fallback text
                        })
                    }
                }
            } else if (typeof msg.content === 'string') {
                blocks.push({ type: 'text', text: msg.content })
            }

            if (blocks.length > 0) {
                if (shouldMerge && lastMsg) {
                    lastMsg.blocks.push(...blocks)
                } else {
                    displayMessages.push({
                        id: msg.id || `msg-${Date.now()}-${displayMessages.length}`,
                        role: msg.role as 'user' | 'assistant',
                        blocks,
                        timestamp: msg.timestamp
                    })
                }
            }
        }

        return displayMessages
    })

    const isLoading = computed(() => gatewayStore.chatLoading)
    const isBusy = computed(() => gatewayStore.isChatBusy)
    const streamingText = computed(() => gatewayStore.chatStream)

    // Scroll to bottom when new messages arrive
    const scrollToBottom = () => {
        nextTick(() => {
            if (messagesContainerRef.value) {
                messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
            }
        })
    }

    // Setup watchers for auto-scroll
    const setupScrollWatchers = () => {
        watch(processedMessages, scrollToBottom, { deep: true })
        watch(() => streamingText.value, scrollToBottom)
        watch(isLoading, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                // Wait for DOM update and potential markdown rendering
                nextTick(() => {
                    scrollToBottom()
                    setTimeout(scrollToBottom, 500)
                })
            }
        })
    }

    // Format timestamp
    const formatTime = (timestamp?: number): string => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    // Helper to check if avatar string is a URL
    const isAvatarUrl = (avatar: string | null | undefined): boolean => {
        if (!avatar) return false
        return avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/')
    }

    // Refresh chat and scroll
    const refreshChatAndScroll = async () => {
        await gatewayStore.refreshChat()
        scrollToBottom()
    }

    return {
        processedMessages,
        isLoading,
        isBusy,
        streamingText,
        scrollToBottom,
        setupScrollWatchers,
        formatTime,
        isAvatarUrl,
        refreshChatAndScroll
    }
}
