/**
 * 发送队列（pending queue）客户端模型
 *
 * busy 期间 steer / follow-up 的文本已在服务端排队，但尚未 drain 落盘。
 * 这里维护一份按 session 隔离的本地队列（localStorage 持久化），
 * 通过「user 回显精确匹配 + 全量消息多集比对」两个信号驱动转正：
 * - SSE message_start（role=user）回显命中 → 立即出队并把回显转成正式气泡；
 * - done / load / attach 后的全量消息 → reconcile 清掉已落盘条目（兜底）。
 */

export const PENDING_QUEUE_STORAGE_KEY = 'seedclaw_pending_queue'

export type PendingSendMode = 'follow' | 'steer'

export interface PendingItem {
    /** 前端生成（createRuntimeId('pending')），队列条目移除按钮按它定位 */
    id: string
    /** 原始文本；与服务端队列文本一致（服务端模板展开会改写时精确匹配失效，✕ 兜底） */
    text: string
    mode: PendingSendMode
    timestamp: number
}

// ==================== 纯函数 ====================

/** 把 SSE / 历史消息的 user content 归一为纯文本（string 或 [{type:'text'}] blocks） */
export function extractUserText(content: unknown): string {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''

    const parts: string[] = []
    for (const block of content) {
        if (
            block && typeof block === 'object'
            && (block as any).type === 'text'
            && typeof (block as any).text === 'string'
        ) {
            parts.push((block as any).text)
        }
    }
    return parts.join('\n')
}

/**
 * 服务端 steer / followUp 是两条独立队列：steer 在当前 run 内注入、followUp 在本轮
 * 结束后 drain，投递顺序不保证全局 FIFO。故按「各自队头 + 文本精确匹配」识别回显；
 * 两条队头同文本时取更早入队者（回退全局 FIFO）。未命中返回 null（交给 reconcile 兜底）。
 */
export function consumeQueueHead(
    queue: PendingItem[],
    text: string,
): { item: PendingItem; rest: PendingItem[] } | null {
    if (!text || queue.length === 0) return null

    const steerHead = queue.findIndex(i => i.mode === 'steer')
    const followHead = queue.findIndex(i => i.mode === 'follow')

    let idx = -1
    if (steerHead >= 0 && queue[steerHead].text === text) idx = steerHead
    if (followHead >= 0 && queue[followHead].text === text && (idx < 0 || followHead < idx)) {
        idx = followHead
    }
    if (idx < 0) return null

    return { item: queue[idx], rest: [...queue.slice(0, idx), ...queue.slice(idx + 1)] }
}

/**
 * 与全量消息做多集匹配，返回应保留的队列（已 drain 的条目移除）。
 * 每条文本只消费历史里出现的次数：queue [x,x] + 消息里 1 条 x → 保留队尾那条。
 * 已知限制：历史里恰好有同文本旧消息时会误删新排队条目（刷新场景无法区分），
 * 下一次 done 全量刷新会补回真实消息，自愈。
 */
export function reconcileQueue(
    queue: PendingItem[],
    messages: Array<{ role?: string; content: any }>,
): PendingItem[] {
    if (queue.length === 0) return queue

    const counts = new Map<string, number>()
    for (const msg of messages) {
        if (msg?.role !== 'user') continue
        const text = extractUserText(msg.content)
        if (!text) continue
        counts.set(text, (counts.get(text) || 0) + 1)
    }

    // 从队头起消费：FIFO 下被 drain 的正是最早入队的同文本条目
    const kept: PendingItem[] = []
    for (const entry of queue) {
        const remain = counts.get(entry.text) || 0
        if (remain > 0) {
            counts.set(entry.text, remain - 1)
        } else {
            kept.push(entry)
        }
    }
    return kept
}

const isPendingSendMode = (value: unknown): value is PendingSendMode =>
    value === 'follow' || value === 'steer'

/** localStorage 记录解析防御（类型校验，模式对齐 inputHistory 的 normalize*） */
export function normalizeQueueRecord(value: unknown): Record<string, PendingItem[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    const normalized: Record<string, PendingItem[]> = {}
    for (const [sessionKey, items] of Object.entries(value as Record<string, unknown>)) {
        if (!sessionKey || !Array.isArray(items)) continue

        const cleaned = items
            .filter((entry): entry is PendingItem =>
                !!entry && typeof entry === 'object'
                && typeof (entry as any).id === 'string' && (entry as any).id.length > 0
                && typeof (entry as any).text === 'string' && (entry as any).text.trim().length > 0
                && isPendingSendMode((entry as any).mode))
            .map(entry => ({
                id: entry.id,
                text: entry.text,
                mode: entry.mode,
                timestamp: typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
                    ? entry.timestamp
                    : 0,
            }))

        if (cleaned.length > 0) {
            normalized[sessionKey] = cleaned
        }
    }

    return normalized
}

// ==================== 存储封装 ====================

export interface PendingQueueStore {
    get(sessionKey: string): PendingItem[]
    set(sessionKey: string, items: PendingItem[]): void
    remove(sessionKey: string): void
}

/** storage 可注入（node 测试用 MemoryStorage fake）；每次读-改-写只更新对应 session 键 */
export function createPendingQueueStore(storage: Storage | null = null): PendingQueueStore {
    const readRecord = (): Record<string, PendingItem[]> => {
        try {
            const raw = storage?.getItem(PENDING_QUEUE_STORAGE_KEY)
            if (!raw) return {}
            return normalizeQueueRecord(JSON.parse(raw))
        } catch (error) {
            console.error('Failed to load pending queue:', error)
            return {}
        }
    }

    const writeRecord = (record: Record<string, PendingItem[]>) => {
        try {
            if (!storage) return

            if (Object.keys(record).length === 0) {
                storage.removeItem(PENDING_QUEUE_STORAGE_KEY)
            } else {
                storage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(record))
            }
        } catch (error) {
            console.error('Failed to persist pending queue:', error)
        }
    }

    return {
        get(sessionKey) {
            if (!sessionKey) return []
            return readRecord()[sessionKey] ?? []
        },
        set(sessionKey, items) {
            if (!sessionKey) return

            const record = readRecord()
            if (items.length > 0) {
                record[sessionKey] = items
            } else {
                delete record[sessionKey]
            }
            writeRecord(record)
        },
        remove(sessionKey) {
            if (!sessionKey) return

            const record = readRecord()
            if (!(sessionKey in record)) return
            delete record[sessionKey]
            writeRecord(record)
        },
    }
}

/** 模块级单例：useChatState（读写）与 useSessionsState（删会话清理）共享同一份记录 */
export const pendingQueueStore = createPendingQueueStore(
    typeof localStorage === 'undefined' ? null : localStorage,
)
