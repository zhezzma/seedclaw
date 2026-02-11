import { computed, watch, nextTick, ref, type Ref, type Reactive } from 'vue'
import { useGateway } from './useGateway'
import { useChatState } from './useChatState'
import type { ChatState } from '~openclaw/ui/src/ui/controllers/chat'
import { useUiSettingsStore } from '../stores/setting'

// Types for internal display
export interface DisplayBlock {
    type: 'text' | 'tool' | 'image' | 'thinking' | 'error' | 'unknown'
    text?: string
    toolCallId?: string
    toolName?: string
    toolArgs?: any
    toolResult?: any
    toolState?: 'calling' | 'success' | 'error'
    toolError?: string
    error?: string // For top-level message errors
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

export function useChatMessages(state: ChatState & { chatToolMessages?: any[] }, messagesContainerRef: Ref<HTMLDivElement | null>) {

    // Transform raw messages into display messages with merged tool results
    const processedMessages = computed(() => {
        const rawMessages = state.chatMessages || []
        const toolMessages = state.chatToolMessages || []
        if (toolMessages.length > 0) {
            console.log(`[useChatMessages] Recomputing. Tool messages: ${toolMessages.length}`, toolMessages)
        }
        const allMessages = [...rawMessages, ...toolMessages]
        const displayMessages: DisplayMessage[] = []

        // map toolCallId -> { messageIndex, blockIndex }
        const toolCallRegistry = new Map<string, { msgIdx: number, blockIdx: number }>()

        for (const msg of allMessages) {
            if (msg.role === 'toolResult') {
                // Find corresponding tool call and update it
                const toolCallId = msg.toolCallId;
                const reg = toolCallRegistry.get(toolCallId)
                if (reg) {
                    const targetMsg = displayMessages[reg.msgIdx]
                    if (targetMsg) {
                        const targetBlock = targetMsg.blocks[reg.blockIdx]
                        if (targetBlock && targetBlock.type === 'tool') {
                            targetBlock.toolResult = msg.content

                            // Simple error detection logic (fallback)
                            let isError = false
                            let errorMsg = ''

                            if (msg.isError) {
                                isError = true
                                errorMsg = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                            } else if (msg.details?.status === 'error') {
                                isError = true
                                errorMsg = msg.details.error || 'Unknown error'
                            }

                            if (isError) {
                                targetBlock.toolState = 'error'
                                targetBlock.toolError = errorMsg
                            } else if (!targetBlock.toolState || targetBlock.toolState === 'calling') {
                                targetBlock.toolState = 'success'
                            }
                        }
                    }
                }
                continue
            }

            const blocks: DisplayBlock[] = []
            // Determine if we should merge with the previous message
            const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
            const settings = useUiSettingsStore()

            let shouldMerge = false;
            if (settings.assistantMsgMerge && msg.role === 'assistant') {
                if (lastMsg && lastMsg.role === 'assistant') {
                    shouldMerge = true;
                }
                //用户调用的命令不合并
                if (msg.provider == "openclaw" && msg.model == "gateway-injected" && msg.api == "openai-responses") {
                    shouldMerge = false;
                }
            }



            const targetMsgIdx = shouldMerge ? displayMessages.length - 1 : displayMessages.length
            const baseBlockIdx = shouldMerge ? (lastMsg?.blocks.length || 0) : 0

            if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    if (item.type === 'text') {
                        if (item.text) blocks.push({ type: 'text', text: item.text })
                    } else if (item.type === 'toolCall') {
                        blocks.push({
                            type: 'tool',
                            toolCallId: item.id, // support both
                            toolName: item.name,
                            toolArgs: item.arguments,
                            toolState: 'calling'
                        })
                        // Register location
                        const id = item.id || item.toolCallId
                        if (id) {
                            toolCallRegistry.set(id, { msgIdx: targetMsgIdx, blockIdx: baseBlockIdx + blocks.length - 1 })
                        }
                    } else if (item.type === 'image') {
                        // Both local and API format use: data (raw base64) + mimeType
                        blocks.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: item.mimeType || item.source?.media_type,
                                data: item.data || item.source?.data
                            }
                        } as DisplayBlock)
                    } else if (item.type === 'thinking') {
                        blocks.push({
                            type: 'thinking',
                            text: item.thinking
                        })
                    } else {
                        // Fallback for unknown types
                        blocks.push({
                            type: 'unknown',
                            text: JSON.stringify(item)
                        })
                    }
                }
            } else if (typeof msg.content === 'string') {
                blocks.push({ type: 'text', text: msg.content })
            }

            // Check for top-level errors (e.g. from API)
            if (msg.errorMessage) {
                blocks.push({
                    type: 'error',
                    error: msg.errorMessage
                })
            }

            if (blocks.length > 0) {
                if (shouldMerge && lastMsg) {
                    lastMsg.blocks.push(...blocks)
                } else {
                    displayMessages.push({
                        id: msg.id || `${state.sessionKey || 'temp'}-msg-${displayMessages.length}`,
                        role: msg.role as 'user' | 'assistant',
                        blocks,
                        timestamp: msg.timestamp
                    })
                }
            }
        }

        // Append streaming text
        if (state.chatStream) {
            const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
            if (lastMsg && lastMsg.role === 'assistant') {
                // Try to append to last text block if possible
                const lastBlock = lastMsg.blocks.length > 0 ? lastMsg.blocks[lastMsg.blocks.length - 1] : null
                if (lastBlock && lastBlock.type === 'text') {
                    lastBlock.text += state.chatStream
                } else {
                    lastMsg.blocks.push({ type: 'text', text: state.chatStream })
                }
            } else {
                displayMessages.push({
                    id: 'streaming-pending',
                    role: 'assistant',
                    blocks: [{ type: 'text', text: state.chatStream }],
                    timestamp: Date.now()
                })
            }
        } else if (state.chatSending || Boolean(state.chatRunId)) {
            // Show pending state if busy
            const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
            if (lastMsg && lastMsg.role === 'assistant') {
                // Already have assistant bubble
            } else {
                displayMessages.push({
                    id: 'streaming-pending',
                    role: 'assistant',
                    blocks: [{ type: 'text', text: '' }],
                    timestamp: Date.now()
                })
            }
        }

        return displayMessages
    })

    const isLoading = computed(() => state.chatLoading)
    const isBusy = computed(() => state.chatSending || Boolean(state.chatRunId))
    const streamingText = computed(() => state.chatStream)

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
    // Note: Assistant identity and history loading now require compatible state
    const refreshChatAndScroll = async () => {
        const chatState = useChatState()
        await chatState.loadAssistantIdentity()
        await chatState.loadChatHistory()

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
