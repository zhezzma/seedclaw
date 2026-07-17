import test from 'node:test'
import assert from 'node:assert/strict'
import { useMediaPreview } from '../src/composables/useMediaPreview.ts'

const mediaPreview = useMediaPreview()

const resetPreview = () => {
    mediaPreview.closeLightbox()
    mediaPreview.setLightboxSources([])
}

test.beforeEach(resetPreview)
test.afterEach(resetPreview)

test('opens at the matching session image and wraps in both directions', () => {
    mediaPreview.setLightboxSources(['one.png', 'two.png', 'three.png'])
    mediaPreview.openLightbox('two.png')

    assert.deepEqual(mediaPreview.lightboxSources.value, ['one.png', 'two.png', 'three.png'])
    assert.equal(mediaPreview.lightboxIndex.value, 1)
    assert.equal(mediaPreview.canNavigateLightbox.value, true)

    mediaPreview.showNextImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'three.png')

    mediaPreview.showNextImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'one.png')

    mediaPreview.showPreviousImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'three.png')
})

test('opens a source outside the session as an isolated image', () => {
    mediaPreview.setLightboxSources(['session.png'])
    mediaPreview.openLightbox('unsent.png')

    assert.deepEqual(mediaPreview.lightboxSources.value, ['unsent.png'])
    assert.equal(mediaPreview.lightboxIndex.value, 0)
    assert.equal(mediaPreview.canNavigateLightbox.value, false)

    mediaPreview.showNextImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'unsent.png')
})

test('keyboard arrows navigate only while a multi-image lightbox is open', () => {
    mediaPreview.setLightboxSources(['one.png', 'two.png'])

    let prevented = 0
    const right = {
        key: 'ArrowRight',
        preventDefault: () => { prevented += 1 },
    } as KeyboardEvent

    mediaPreview.handleLightboxKeydown(right)
    assert.equal(prevented, 0)

    mediaPreview.openLightbox('one.png')
    mediaPreview.handleLightboxKeydown(right)
    assert.equal(mediaPreview.lightboxSrc.value, 'two.png')
    assert.equal(prevented, 1)
})

test('switching images resets zoom and translation', () => {
    mediaPreview.setLightboxSources(['one.png', 'two.png'])
    mediaPreview.openLightbox('one.png')
    mediaPreview.imgScale.value = 3
    mediaPreview.imgTranslateX.value = 45
    mediaPreview.imgTranslateY.value = -20

    mediaPreview.showNextImage()

    assert.equal(mediaPreview.imgScale.value, 1)
    assert.equal(mediaPreview.imgTranslateX.value, 0)
    assert.equal(mediaPreview.imgTranslateY.value, 0)
})
