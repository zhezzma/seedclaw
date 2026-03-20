import test from 'node:test'
import assert from 'node:assert/strict'

import { createRuntimeId } from '../src/utils/runtime-id.ts'

test('uses crypto.randomUUID when available', () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
        value: { ...originalCrypto, randomUUID: () => 'uuid-from-crypto' },
        configurable: true,
    })

    try {
        assert.equal(createRuntimeId('seed'), 'uuid-from-crypto')
    } finally {
        Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true })
    }
})

test('falls back to a non-empty prefixed id when crypto.randomUUID is unavailable', () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
        value: { ...originalCrypto, randomUUID: undefined },
        configurable: true,
    })

    try {
        const id = createRuntimeId('seed')
        assert.match(id, /^seed-/)
        assert.ok(id.length > 'seed-'.length)
    } finally {
        Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true })
    }
})

test('fallback ids remain non-empty across multiple calls', () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
        value: { ...originalCrypto, randomUUID: undefined },
        configurable: true,
    })

    try {
        const first = createRuntimeId('chat')
        const second = createRuntimeId('chat')
        assert.match(first, /^chat-/)
        assert.match(second, /^chat-/)
        assert.notEqual(first, second)
    } finally {
        Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true })
    }
})
