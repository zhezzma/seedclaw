import test from 'node:test'
import assert from 'node:assert/strict'

test('clawhub client import does not crash when crypto.randomUUID is unavailable', async () => {
    const originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
        value: { ...originalCrypto, randomUUID: undefined },
        configurable: true,
    })

    try {
        const module = await import(`../src/composables/clawhub-client.ts?test=${Date.now()}`)
        assert.ok(module.clawHubClient)
        assert.equal(typeof (module.clawHubClient as any).sessionId, 'string')
        assert.ok((module.clawHubClient as any).sessionId.length > 0)
    } finally {
        Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true })
    }
})
