import test from 'node:test'
import assert from 'node:assert/strict'
import { useMediaPreview } from '../src/composables/useMediaPreview.ts'

const mediaPreview = useMediaPreview()
const RealDate = Date

function mockDateSequence(times: number[]) {
    let index = 0

    const nextTime = () => {
        const time = times[Math.min(index, times.length - 1)] ?? 0
        index += 1
        return time
    }

    class MockDate extends RealDate {
        constructor(...args: ConstructorParameters<DateConstructor>) {
            if (args.length > 0) {
                super(...args)
                return
            }

            super(nextTime())
        }

        static now() {
            return nextTime()
        }

        static parse = RealDate.parse
        static UTC = RealDate.UTC
    }

    globalThis.Date = MockDate as DateConstructor

    return () => {
        globalThis.Date = RealDate
    }
}

test.beforeEach(() => {
    mediaPreview.closeLightbox()
    globalThis.Date = RealDate
})

test.afterEach(() => {
    mediaPreview.closeLightbox()
    globalThis.Date = RealDate
})

test('ignores synthetic dblclick generated right after a touch double tap on mobile', () => {
    mediaPreview.openLightbox('https://example.com/demo.png')

    const restoreDate = mockDateSequence([1000, 1200, 1200])

    try {
        mediaPreview.handleTouchEnd({ touches: [] } as TouchEvent)
        mediaPreview.handleTouchEnd({ touches: [] } as TouchEvent)

        assert.equal(mediaPreview.imgScale.value, 2.5, 'double tap should zoom in on mobile')

        mediaPreview.handleImageDblClick({ stopPropagation() { } } as Event)

        assert.equal(
            mediaPreview.imgScale.value,
            2.5,
            'synthetic dblclick should not immediately undo the touch double tap zoom',
        )
    } finally {
        restoreDate()
    }
})

test('keeps desktop dblclick zoom toggling behavior intact', () => {
    mediaPreview.openLightbox('https://example.com/demo.png')

    mediaPreview.handleImageDblClick({ stopPropagation() { } } as Event)
    assert.equal(mediaPreview.imgScale.value, 2.5, 'desktop dblclick should zoom in')

    mediaPreview.handleImageDblClick({ stopPropagation() { } } as Event)
    assert.equal(mediaPreview.imgScale.value, 1, 'desktop dblclick should zoom back out on second toggle')
})
