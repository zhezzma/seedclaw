import test from 'node:test'
import assert from 'node:assert/strict'
import jitiFactory from 'jiti'

const jiti = jitiFactory(import.meta.url, { interopDefault: true })

test('manual upward scroll during active auto-scroll interrupts the lock and pauses auto-scroll', async () => {
    const { resolveAutoScrollOnScroll } = await jiti('../../../src/utils/chatAutoScroll.ts')

    const result = resolveAutoScrollOnScroll({
        isAutoScrolling: true,
        nearBottom: false,
        currentScrollTop: 120,
        lastAutoScrollTop: 980,
    })

    assert.deepEqual(result, {
        isAutoScrolling: false,
        userScrolledUp: true,
    })
})

test('programmatic auto-scroll events keep the lock when the list is still near bottom', async () => {
    const { resolveAutoScrollOnScroll } = await jiti('../../../src/utils/chatAutoScroll.ts')

    const result = resolveAutoScrollOnScroll({
        isAutoScrolling: true,
        nearBottom: true,
        currentScrollTop: 972,
        lastAutoScrollTop: 980,
    })

    assert.deepEqual(result, {
        isAutoScrolling: true,
        userScrolledUp: false,
    })
})
