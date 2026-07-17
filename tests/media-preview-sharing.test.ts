import test from 'node:test'
import assert from 'node:assert/strict'
import { useMediaPreview } from '../src/composables/useMediaPreview.ts'
import { useToast } from '../src/composables/useToast.ts'

const mediaPreview = useMediaPreview()
const toast = useToast()
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalFetch = globalThis.fetch

const setNavigator = (value: Partial<Navigator>) => {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value,
    })
}

const restoreGlobals = () => {
    if (originalNavigator) {
        Object.defineProperty(globalThis, 'navigator', originalNavigator)
    } else {
        delete (globalThis as { navigator?: Navigator }).navigator
    }
    globalThis.fetch = originalFetch
    toast.clear()
}

test.afterEach(restoreGlobals)

test('reports unsupported native sharing with the localized failure toast', async () => {
    setNavigator({})

    await assert.doesNotReject(() => mediaPreview.shareImage('https://example.com/photo.png'))

    assert.equal(toast.toasts.value.at(-1)?.message, '分享图片失败')
})

test('shares the fetched image as a file when native file sharing is supported', async () => {
    const shareCalls: ShareData[] = []
    setNavigator({
        canShare: data => Boolean(data?.files?.length),
        share: async data => { shareCalls.push(data) },
    })
    globalThis.fetch = async () => ({
        ok: true,
        blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
    }) as Response

    await mediaPreview.shareImage('https://example.com/photo.jpg')

    assert.equal(shareCalls.length, 1)
    assert.equal(shareCalls[0].files?.length, 1)
    assert.equal(shareCalls[0].files?.[0].name.endsWith('.jpg'), true)
    assert.equal(shareCalls[0].files?.[0].type, 'image/jpeg')
})

test('falls back to sharing an HTTP image URL when file retrieval fails', async () => {
    const shareCalls: ShareData[] = []
    setNavigator({
        canShare: () => false,
        share: async data => { shareCalls.push(data) },
    })
    globalThis.fetch = async () => { throw new Error('network failure') }

    await mediaPreview.shareImage('https://example.com/photo.png')

    assert.deepEqual(shareCalls, [{ url: 'https://example.com/photo.png' }])
})

test('treats native share cancellation as final without URL fallback', async () => {
    const shareCalls: ShareData[] = []
    setNavigator({
        canShare: data => Boolean(data?.files?.length),
        share: async data => {
            shareCalls.push(data)
            const error = new Error('cancelled')
            error.name = 'AbortError'
            throw error
        },
    })
    globalThis.fetch = async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
    }) as Response

    await mediaPreview.shareImage('https://example.com/photo.png')

    assert.equal(shareCalls.length, 1)
    assert.equal(shareCalls[0].files?.length, 1)
})
