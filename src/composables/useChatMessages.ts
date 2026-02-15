import { computed, watch, nextTick, ref, type Ref } from 'vue'
import { useChatState, type ChatMessage } from './useChatState'
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

export interface ChatStateShape {
    chatMessages: ChatMessage[]
    chatToolMessages?: ChatMessage[]
    chatStream: any[] | null
    chatSending?: boolean
    chatRunId?: string | null
    chatLoading?: boolean
    sessionKey?: string
    [key: string]: any
}

export function useChatMessages(state: ChatStateShape, messagesContainerRef: Ref<HTMLDivElement | null>) {

    // 转换原始消息为显示格式，并合并工具调用结果
    const processedMessages = computed(() => {
        const rawMessages = state.chatMessages || []
        const toolMessages = state.chatToolMessages || [] // 单独存储的工具调用结果
        const allMessages = [...rawMessages, ...toolMessages]
        const displayMessages: DisplayMessage[] = []

        // 工具调用注册表: map toolCallId -> { messageIndex, blockIndex }
        // 用于快速查找并更新 Tool Call 状态
        const toolCallRegistry = new Map<string, { msgIdx: number, blockIdx: number }>()
        const settings = useUiSettingsStore()

        // 辅助函数：将API返回的内容项转换为显示 Block
        const convertToBlocks = (content: any): DisplayBlock[] => {
            const blocks: DisplayBlock[] = []

            // 如果 content 是数组，遍历处理
            if (Array.isArray(content)) {
                for (const item of content) {
                    if (item.type === 'text') {
                        if (item.text) blocks.push({ type: 'text', text: item.text })
                    } else if (item.type === 'toolCall') {
                        const block: DisplayBlock = {
                            type: 'tool',
                            toolCallId: item.id || item.toolCallId,
                            toolName: item.name,
                            toolArgs: item.arguments,
                            toolState: item.toolState || 'calling',
                            toolResult: item.toolResult,
                            toolError: item.toolError
                        }
                        blocks.push(block)
                    } else if (item.type === 'image') {
                        blocks.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: item.mimeType || item.source?.media_type,
                                data: item.data || item.source?.data
                            }
                        })
                    } else if (item.type === 'thinking') {
                        // 过滤掉空的或仅包含空白的思考过程
                        if (item.thinking && item.thinking.trim().length > 0) {
                            blocks.push({
                                type: 'thinking',
                                text: item.thinking
                            })
                        }
                    } else {
                        // 未知类型，转为 JSON 字符串显示
                        blocks.push({
                            type: 'unknown',
                            text: JSON.stringify(item)
                        })
                    }
                }
            } else if (typeof content === 'string') {
                // 纯字符串内容
                blocks.push({ type: 'text', text: content })
            }
            return blocks
        }

        // 1. 处理历史消息
        for (const msg of allMessages) {
            // 1.1 处理 Tool Result 消息 (后端返回的独立消息 role='toolResult')
            if (msg.role === 'toolResult') {
                const toolCallId = msg.toolCallId;
                if (toolCallId) {
                    const reg = toolCallRegistry.get(toolCallId)
                    if (reg) {
                        const targetMsg = displayMessages[reg.msgIdx]
                        if (targetMsg) {
                            const targetBlock = targetMsg.blocks[reg.blockIdx]
                            // 更新目标 Tool Block 的状态和结果
                            if (targetBlock && targetBlock.type === 'tool') {
                                targetBlock.toolResult = msg.content

                                // 简单的错误检测逻辑
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
                }
                continue // Tool Result 不作为独立气泡显示，而是更新对应 Tool Call
            }

            // 1.2 处理普通消息 (User / Assistant)
            const blocks: DisplayBlock[] = convertToBlocks(msg.content)

            // 顶级错误信息处理
            if (msg.errorMessage) {
                blocks.push({ type: 'error', error: msg.errorMessage })
            }

            if (blocks.length > 0) {
                // 判断是否合并消息 (Assistant 连续发言)
                const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
                let shouldMerge = false;

                if (settings.assistantMsgMerge && msg.role === 'assistant') {
                    if (lastMsg && lastMsg.role === 'assistant') {
                        shouldMerge = true;
                    }
                }

                if (shouldMerge && lastMsg) {
                    // 记录合并前的起始 Block 索引
                    const baseBlockIdx = lastMsg.blocks.length
                    lastMsg.blocks.push(...blocks)

                    // 注册合并后的 Tool Call
                    blocks.forEach((b, idx) => {
                        if (b.type === 'tool' && b.toolCallId) {
                            toolCallRegistry.set(b.toolCallId, { msgIdx: displayMessages.length - 1, blockIdx: baseBlockIdx + idx })
                        }
                    })
                } else {
                    // 创建新消息
                    const newMsg: DisplayMessage = {
                        id: msg.id || `${state.sessionKey || 'temp'}-msg-${displayMessages.length}`,
                        role: msg.role as 'user' | 'assistant',
                        blocks,
                        timestamp: msg.timestamp
                    }
                    displayMessages.push(newMsg)
                    // 注册新消息中的 Tool Call
                    blocks.forEach((b, idx) => {
                        if (b.type === 'tool' && b.toolCallId) {
                            toolCallRegistry.set(b.toolCallId, { msgIdx: displayMessages.length - 1, blockIdx: idx })
                        }
                    })
                }
            }
        }

        // 2. 处理流式输出 (Streaming)
        if (state.chatStream && Array.isArray(state.chatStream)) {
            const streamBlocks: DisplayBlock[] = convertToBlocks(state.chatStream)

            if (streamBlocks.length > 0) {
                const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null

                // 判断流式内容是否应合并到上一条 Assistant 消息
                const shouldMergeStream = settings.assistantMsgMerge && lastMsg && lastMsg.role === 'assistant'

                if (shouldMergeStream && lastMsg) {
                    lastMsg.blocks.push(...streamBlocks)
                } else {
                    displayMessages.push({
                        id: 'streaming-pending',
                        role: 'assistant',
                        blocks: streamBlocks,
                        timestamp: Date.now()
                    })
                }
            }
        } else if (state.chatSending || Boolean(state.chatRunId)) {
            // 3. 等待中状态 (Loading/Thinking placeholder)
            // 仅当最后一条不是 assistant 消息时显示空 bubble，或者始终显示一个 loading indicator
            // 旧逻辑：如果不合并或最后一条不是 assistant，显示纯空文本框占位
            const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
            if (!lastMsg || lastMsg.role !== 'assistant') {
                displayMessages.push({
                    id: 'streaming-pending',
                    role: 'assistant',
                    blocks: [{ type: 'text', text: '' }], // 空文本 Block 用于 UI 显示 Loading 状态
                    timestamp: Date.now()
                })
            }
        }

        return displayMessages
    })

    const isLoading = computed(() => state.chatLoading)
    const isBusy = computed(() => state.chatSending || Boolean(state.chatRunId))
    const streamingText = computed(() => state.chatStream)

    const scrollToBottom = () => {
        nextTick(() => {
            if (messagesContainerRef.value) {
                messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
            }
        })
    }

    const setupScrollWatchers = () => {
        watch(processedMessages, scrollToBottom, { deep: true })
        watch(() => streamingText.value, scrollToBottom)
        watch(isLoading, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                nextTick(() => {
                    scrollToBottom()
                    setTimeout(scrollToBottom, 500)
                })
            }
        })
    }

    const formatTime = (timestamp?: number): string => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    const isAvatarUrl = (avatar: string | null | undefined): boolean => {
        if (!avatar) return false
        return avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/')
    }

    const refreshChatAndScroll = async () => {
        const chatState = useChatState()
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
