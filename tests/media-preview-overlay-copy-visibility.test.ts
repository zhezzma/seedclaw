import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const source = readFileSync(path.join(repoRoot, 'src/components/chat/MediaPreviewOverlay.vue'), 'utf8')

test('media preview overlay hides image copy on mobile but keeps desktop copy wiring', () => {
  assert.match(source, /const isMobileDevice = \/Android\|iPhone\|iPad\|iPod\/i\.test\(navigator\.userAgent\)/)
  assert.match(source, /<button v-if="!isMobileDevice" @click\.stop="copyImageToClipboard\(lightboxSrc\)"/)
  assert.match(source, /@click\.stop="downloadImage\(lightboxSrc\)"/)
  assert.match(source, /copyImageToClipboard/)
})
