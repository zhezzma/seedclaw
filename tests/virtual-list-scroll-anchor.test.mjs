import test from 'node:test'
import assert from 'node:assert/strict'
import jitiFactory from 'jiti'

const jiti = jitiFactory(import.meta.url, { interopDefault: true })

test('compensates height growth for rows fully above the viewport to preserve upward scroll progress', async () => {
    const { calculateVirtualScrollCompensation } = await jiti('../src/utils/virtualListScrollAnchor.ts')

    const compensation = calculateVirtualScrollCompensation({
        orderedKeys: ['m1', 'm2', 'm3', 'm4'],
        heights: {
            m1: 120,
            m2: 120,
            m3: 120,
            m4: 120,
        },
        estimatedHeight: 136,
        scrollTop: 300,
        changes: [
            { key: 'm2', nextHeight: 260 },
            { key: 'm4', nextHeight: 200 },
        ],
    })

    assert.equal(compensation, 140)
})

test('does not compensate rows that start inside or below the viewport', async () => {
    const { calculateVirtualScrollCompensation } = await jiti('../src/utils/virtualListScrollAnchor.ts')

    const compensation = calculateVirtualScrollCompensation({
        orderedKeys: ['m1', 'm2', 'm3'],
        heights: {
            m1: 120,
            m2: 120,
            m3: 120,
        },
        estimatedHeight: 136,
        scrollTop: 120,
        changes: [
            { key: 'm2', nextHeight: 220 },
            { key: 'm3', nextHeight: 260 },
        ],
    })

    assert.equal(compensation, 0)
})
