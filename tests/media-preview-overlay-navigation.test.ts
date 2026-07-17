import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const overlay = readFileSync(
    path.join(repoRoot, 'src/components/chat/MediaPreviewOverlay.vue'),
    'utf8',
)
const zh = readFileSync(path.join(repoRoot, 'src/i18n/zh.ts'), 'utf8')
const en = readFileSync(path.join(repoRoot, 'src/i18n/en.ts'), 'utf8')

test('overlay renders previous and next controls only for navigable galleries', () => {
    assert.match(overlay, /v-if="canNavigateLightbox" @click\.stop="showPreviousImage"/)
    assert.match(overlay, /v-if="canNavigateLightbox" @click\.stop="showNextImage"/)
    assert.match(overlay, /t\('chat\.previousImage'\)/)
    assert.match(overlay, /t\('chat\.nextImage'\)/)
})

test('overlay installs and removes the shared lightbox keyboard handler', () => {
    assert.match(overlay, /onMounted\(\(\) => \{\s*window\.addEventListener\('keydown', handleLightboxKeydown\)\s*\}\)/)
    assert.match(overlay, /onBeforeUnmount\(\(\) => \{\s*window\.removeEventListener\('keydown', handleLightboxKeydown\)\s*\}\)/)
})

test('navigation labels exist in both locales', () => {
    assert.match(zh, /previousImage: '上一张'/)
    assert.match(zh, /nextImage: '下一张'/)
    assert.match(en, /previousImage: 'Previous image'/)
    assert.match(en, /nextImage: 'Next image'/)
})

