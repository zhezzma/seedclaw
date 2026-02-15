/**
 * SSE Streaming Client for SeedAgent Chat API
 * 
 * Uses fetch() + ReadableStream to parse SSE from POST /api/chat/:sessionId/chat
 * 
 * SSE Events:
 * - message_start
 * - text_delta -> { delta: string }
 * - thinking_delta -> { delta: string }
 * - tool_start -> { toolName: string }
 * - tool_update -> { partialResult: any }
 * - tool_end -> { toolName: string, isError: boolean }
 * - message_end
 * - turn_end
 * - done -> { message: string }
 */

import { getApiUrl, getAuthToken } from './api-client'

// ==================== Types ====================

export interface SSEEvent {
    event: string
    data: any
}

export interface SSEConnection {
    /** Abort the SSE connection */
    abort: () => void
    /** Promise that resolves when the stream is complete */
    done: Promise<void>
}

export type SSEEventHandler = (event: SSEEvent) => void

// ==================== SSE Client ====================

/**
 * Start an SSE streaming chat session
 */
export function startChatSSE(
    sessionId: string,
    body: { prompt: string; images?: string[] },
    onEvent: SSEEventHandler,
    onError?: (error: Error) => void
): SSEConnection {
    const controller = new AbortController()

    const url = getApiUrl(`/api/chat/${sessionId}/chat`)
    const token = getAuthToken()

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const done = fetchSSE(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
    }, onEvent, onError)

    return {
        abort: () => controller.abort(),
        done,
    }
}

/**
 * Connect to an existing session SSE stream (without prompt)
 */
export function connectSessionSSE(
    sessionId: string,
    onEvent: SSEEventHandler,
    onError?: (error: Error) => void
): SSEConnection {
    const controller = new AbortController()

    const url = getApiUrl(`/api/chat/${sessionId}/connect`)
    const token = getAuthToken()

    const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const done = fetchSSE(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
    }, onEvent, onError)

    return {
        abort: () => controller.abort(),
        done,
    }
}

// ==================== Internal SSE Parser ====================

async function fetchSSE(
    url: string,
    init: RequestInit,
    onEvent: SSEEventHandler,
    onError?: (error: Error) => void
): Promise<void> {
    try {
        const response = await fetch(url, init)

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`
            try {
                const text = await response.text()
                const parsed = JSON.parse(text)
                if (parsed?.message) errorMessage = parsed.message
            } catch {
                // ignore
            }
            throw new Error(errorMessage)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''
        let currentData = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Process complete lines
            const lines = buffer.split('\n')
            // Keep the last incomplete line in buffer
            buffer = lines.pop() || ''

            for (const line of lines) {
                const trimmed = line.trim()

                if (trimmed === '') {
                    // Empty line = dispatch event
                    if (currentEvent || currentData) {
                        try {
                            let parsedData: any = currentData
                            try {
                                parsedData = JSON.parse(currentData)
                            } catch {
                                // keep as string
                            }
                            onEvent({
                                event: currentEvent || 'message',
                                data: parsedData,
                            })
                        } catch (e) {
                            console.error('[SSE] Event handler error:', e)
                        }
                        currentEvent = ''
                        currentData = ''
                    }
                } else if (trimmed.startsWith('event:')) {
                    currentEvent = trimmed.slice(6).trim()
                } else if (trimmed.startsWith('data:')) {
                    const dataContent = trimmed.slice(5).trim()
                    currentData = currentData ? currentData + '\n' + dataContent : dataContent
                } else if (trimmed.startsWith(':')) {
                    // Comment, ignore
                }
            }
        }

        // Process any remaining data in buffer
        if (currentEvent || currentData) {
            try {
                let parsedData: any = currentData
                try {
                    parsedData = JSON.parse(currentData)
                } catch {
                    // keep as string
                }
                onEvent({
                    event: currentEvent || 'message',
                    data: parsedData,
                })
            } catch (e) {
                console.error('[SSE] Final event handler error:', e)
            }
        }
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            // Normal abort, not an error
            return
        }
        console.error('[SSE] Connection error:', error)
        onError?.(error instanceof Error ? error : new Error(String(error)))
    }
}
