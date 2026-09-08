import test from 'node:test'
import assert from 'node:assert/strict'

import {
    PENDING_QUEUE_STORAGE_KEY,
    extractUserText,
    consumeQueueHead,
    reconcileQueue,
    normalizeQueueRecord,
    createPendingQueueStore,
    type PendingItem,
} from '../src/utils/pending-queue.ts'

const item = (over: Partial<PendingItem> = {}): PendingItem => ({
    id: 'p1',
    text: 'hello',
    mode: 'follow',
    timestamp: 1,
    ...over,
})

class MemoryStorage implements Storage {
    private data = new Map<string, string>()

    get length() {
        return this.data.size
    }

    clear(): void {
        this.data.clear()
    }

    getItem(key: string): string | null {
        return this.data.has(key) ? this.data.get(key)! : null
    }

    key(index: number): string | null {
        return Array.from(this.data.keys())[index] ?? null
    }

    removeItem(key: string): void {
        this.data.delete(key)
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value)
    }
}

// ==================== extractUserText ====================

test('extractUserText returns plain string content as-is', () => {
    assert.equal(extractUserText('排队中的消息'), '排队中的消息')
})

test('extractUserText joins text blocks with newline', () => {
    const content = [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
    ]
    assert.equal(extractUserText(content), 'first\nsecond')
})

test('extractUserText skips non-text blocks', () => {
    const content = [
        { type: 'image', mimeType: 'image/png', data: 'xxx' },
        { type: 'text', text: 'only-text' },
        { type: 'thinking', thinking: 'inner' },
        { type: 'toolCall', id: 't1' },
    ]
    assert.equal(extractUserText(content), 'only-text')
})

test('extractUserText returns empty string for null/undefined/object content', () => {
    assert.equal(extractUserText(null), '')
    assert.equal(extractUserText(undefined), '')
    assert.equal(extractUserText({ type: 'text', text: 'nope' }), '')
    assert.equal(extractUserText([]), '')
})

// ==================== consumeQueueHead ====================

test('consumeQueueHead returns null for empty queue or empty text', () => {
    assert.equal(consumeQueueHead([], 'hello'), null)
    assert.equal(consumeQueueHead([item()], ''), null)
})

test('consumeQueueHead consumes the head when text matches exactly', () => {
    const head = item({ id: 'a', text: 'first', mode: 'steer' })
    const tail = item({ id: 'b', text: 'second' })
    const result = consumeQueueHead([head, tail], 'first')

    assert.deepEqual(result?.item, head)
    assert.deepEqual(result?.rest, [tail])
})

test('consumeQueueHead requires exact text match (no trimming)', () => {
    const q = [item({ text: 'hi' })]
    assert.equal(consumeQueueHead(q, ' hi '), null)
    assert.equal(consumeQueueHead(q, 'HI'), null)
})

test('consumeQueueHead matches steer lane head behind a follow head', () => {
    // 服务端 steer / followUp 是两条独立队列：steer 先于 follow 被投递时，回显会跳过全局队头
    const follow = item({ id: 'f1', text: 'after this run', mode: 'follow' })
    const steer = item({ id: 's1', text: 'inject now', mode: 'steer' })
    const result = consumeQueueHead([follow, steer], 'inject now')

    assert.deepEqual(result?.item, steer)
    assert.deepEqual(result?.rest, [follow])
})

test('consumeQueueHead matches follow lane head while steer is queued behind', () => {
    const steer = item({ id: 's1', text: 'inject now', mode: 'steer' })
    const follow = item({ id: 'f1', text: 'after this run', mode: 'follow' })
    const result = consumeQueueHead([steer, follow], 'after this run')

    assert.deepEqual(result?.item, follow)
    assert.deepEqual(result?.rest, [steer])
})

test('consumeQueueHead picks the earlier queued item when both lane heads share the same text', () => {
    const early = item({ id: 'e1', text: 'same', mode: 'follow', timestamp: 1 })
    const late = item({ id: 'l1', text: 'same', mode: 'steer', timestamp: 2 })
    const result = consumeQueueHead([early, late], 'same')

    assert.deepEqual(result?.item, early)
    assert.deepEqual(result?.rest, [late])
})

test('consumeQueueHead ignores non-head items in the same lane', () => {
    // 同一队列严格 FIFO：第二条 steer 未出队前，回显第二条不算命中（reconcile 兜底）
    const first = item({ id: 's1', text: 'one', mode: 'steer' })
    const second = item({ id: 's2', text: 'two', mode: 'steer' })
    assert.equal(consumeQueueHead([first, second], 'two'), null)
})

// ==================== reconcileQueue ====================

test('reconcileQueue returns empty for an empty queue', () => {
    assert.deepEqual(reconcileQueue([], [{ role: 'user', content: 'x' }]), [])
})

test('reconcileQueue drops items whose text is already in user messages', () => {
    const queue = [
        item({ id: 'a', text: 'done-1' }),
        item({ id: 'b', text: 'done-2', mode: 'steer' }),
    ]
    const messages = [
        { role: 'user', content: 'done-1' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: [{ type: 'text', text: 'done-2' }] },
    ]

    assert.deepEqual(reconcileQueue(queue, messages), [])
})

test('reconcileQueue keeps unmatched items in order', () => {
    const a = item({ id: 'a', text: 'queued' })
    const b = item({ id: 'b', text: 'queued-2', mode: 'steer' })
    const messages = [{ role: 'user', content: 'unrelated' }]

    assert.deepEqual(reconcileQueue([a, b], messages), [a, b])
})

test('reconcileQueue is multi-set aware: duplicate texts only consume up to message count', () => {
    const first = item({ id: 'a', text: 'again' })
    const second = item({ id: 'b', text: 'again' })
    const messages = [{ role: 'user', content: 'again' }]

    // 消息里只有一条「again」→ 视为队头已 drain，保留队尾那条
    assert.deepEqual(reconcileQueue([first, second], messages), [second])
})

test('reconcileQueue ignores assistant messages with the same text', () => {
    const queued = item({ id: 'a', text: 'same' })
    const messages = [{ role: 'assistant', content: 'same' }]

    assert.deepEqual(reconcileQueue([queued], messages), [queued])
})

test('reconcileQueue documents the identical-old-text false positive (accepted limitation)', () => {
    // 历史里已有同文本旧消息 + 新排队同文本：刷新后无法区分，条目被误判为已 drain；
    // 下一次 done 全量刷新会补回真实消息，自愈，不做区分
    const queued = item({ id: 'a', text: '继续' })
    const messages = [{ role: 'user', content: '继续' }]

    assert.deepEqual(reconcileQueue([queued], messages), [])
})

test('reconcileQueue keeps partial matches and preserves mode on kept items', () => {
    const drainedFollow = item({ id: 'a', text: 'drained', mode: 'follow' })
    const pendingSteer = item({ id: 'b', text: 'pending', mode: 'steer' })
    const drainedFollow2 = item({ id: 'c', text: 'drained-too', mode: 'follow' })
    const messages = [
        { role: 'user', content: 'drained' },
        { role: 'user', content: 'drained-too' },
    ]

    assert.deepEqual(
        reconcileQueue([drainedFollow, pendingSteer, drainedFollow2], messages),
        [pendingSteer],
    )
})

// ==================== normalizeQueueRecord ====================

test('normalizeQueueRecord returns empty record for invalid input', () => {
    assert.deepEqual(normalizeQueueRecord(null), {})
    assert.deepEqual(normalizeQueueRecord(undefined), {})
    assert.deepEqual(normalizeQueueRecord('nope'), {})
    assert.deepEqual(normalizeQueueRecord(42), {})
    assert.deepEqual(normalizeQueueRecord([]), {})
})

test('normalizeQueueRecord drops sessions with non-array values', () => {
    const result = normalizeQueueRecord({
        'session-a': 'garbage',
        'session-b': { text: 'not an array' },
    })
    assert.deepEqual(result, {})
})

test('normalizeQueueRecord drops items missing id/text or with invalid mode', () => {
    const result = normalizeQueueRecord({
        'session-a': [
            item({ id: 'ok', text: 'fine', mode: 'steer', timestamp: 5 }),
            { id: 'no-text', mode: 'follow' },
            { id: 'empty-text', text: '  ', mode: 'follow' },
            { text: 'no-id', mode: 'follow' },
            { id: 'bad-mode', text: 'x', mode: 'queue' },
            { id: 'no-mode', text: 'x' },
            null,
            'stray',
        ],
    })

    assert.deepEqual(result, {
        'session-a': [item({ id: 'ok', text: 'fine', mode: 'steer', timestamp: 5 })],
    })
})

test('normalizeQueueRecord fills invalid timestamps with 0 and drops sessions that end up empty', () => {
    const result = normalizeQueueRecord({
        'session-a': [{ id: 'a', text: 'x', mode: 'follow' }],
        'session-b': [],
    })

    assert.deepEqual(result, { 'session-a': [{ id: 'a', text: 'x', mode: 'follow', timestamp: 0 }] })
})

test('normalizeQueueRecord keeps multiple sessions and preserves item order', () => {
    const first = item({ id: 'a', text: 'one' })
    const second = item({ id: 'b', text: 'two', mode: 'steer' })

    const result = normalizeQueueRecord({
        'session-b': [second],
        'session-a': [first],
    })

    assert.deepEqual(Object.keys(result).sort(), ['session-a', 'session-b'])
    assert.deepEqual(result['session-a'], [first])
    assert.deepEqual(result['session-b'], [second])
})

// ==================== createPendingQueueStore ====================

test('pending queue store returns empty list for unknown sessions', () => {
    const store = createPendingQueueStore(new MemoryStorage())

    assert.deepEqual(store.get('missing'), [])
})

test('pending queue store persists per-session queues into localStorage', () => {
    const storage = new MemoryStorage()
    const store = createPendingQueueStore(storage)

    const entries = [item({ id: 'a', text: 'one' }), item({ id: 'b', text: 'two', mode: 'steer' })]
    store.set('session-a', entries)

    assert.deepEqual(store.get('session-a'), entries)
    assert.equal(
        storage.getItem(PENDING_QUEUE_STORAGE_KEY),
        JSON.stringify({ 'session-a': entries }),
    )
})

test('pending queue store update overwrites only the target session', () => {
    const storage = new MemoryStorage()
    const store = createPendingQueueStore(storage)

    store.set('session-a', [item({ id: 'a', text: 'a' })])
    store.set('session-b', [item({ id: 'b', text: 'b' })])
    const replaced = [item({ id: 'a2', text: 'a2', mode: 'steer' })]
    store.set('session-a', replaced)

    assert.deepEqual(store.get('session-a'), replaced)
    assert.deepEqual(store.get('session-b'), [item({ id: 'b', text: 'b' })])
})

test('pending queue store removes the whole storage key when the last session clears its queue', () => {
    const storage = new MemoryStorage()
    const store = createPendingQueueStore(storage)

    store.set('session-a', [item()])
    store.set('session-a', [])

    assert.equal(storage.getItem(PENDING_QUEUE_STORAGE_KEY), null)
    assert.deepEqual(store.get('session-a'), [])
})

test('pending queue store remove deletes only the target session', () => {
    const storage = new MemoryStorage()
    const store = createPendingQueueStore(storage)

    store.set('session-a', [item({ id: 'a', text: 'a' })])
    store.set('session-b', [item({ id: 'b', text: 'b' })])
    store.remove('session-a')

    assert.deepEqual(store.get('session-a'), [])
    assert.deepEqual(store.get('session-b'), [item({ id: 'b', text: 'b' })])
    assert.equal(
        storage.getItem(PENDING_QUEUE_STORAGE_KEY),
        JSON.stringify({ 'session-b': [item({ id: 'b', text: 'b' })] }),
    )
})

test('pending queue store hydrates queues persisted by another instance (page refresh)', () => {
    const storage = new MemoryStorage()
    const entries = [item({ id: 'a', text: 'queued while busy', mode: 'steer', timestamp: 42 })]
    storage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify({ 'session-a': entries }))

    const store = createPendingQueueStore(storage)

    assert.deepEqual(store.get('session-a'), entries)
})

test('pending queue store sanitizes corrupted or invalid persisted payloads', () => {
    const storage = new MemoryStorage()
    const store = createPendingQueueStore(storage)

    storage.setItem(PENDING_QUEUE_STORAGE_KEY, '{not-json')
    assert.deepEqual(store.get('session-a'), [])

    storage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify({
        'session-a': [{ id: 'ok', text: 'fine', mode: 'follow' }, 'garbage'],
        'session-b': 'garbage',
    }))
    assert.deepEqual(store.get('session-a'), [{ id: 'ok', text: 'fine', mode: 'follow', timestamp: 0 }])
    assert.deepEqual(store.get('session-b'), [])
})

test('pending queue store tolerates missing storage without throwing', () => {
    const store = createPendingQueueStore(null)

    assert.deepEqual(store.get('session-a'), [])
    store.set('session-a', [item()])
    store.remove('session-a')
})
