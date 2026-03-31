import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const source = readFileSync(path.join(repoRoot, 'src/components/chat/MediaPreviewOverlay.vue'), 'utf8')

test('overlay still keeps the download button visible while gating copy only', () => {
  assert.match(source, /const isMobileDevice = \/Android\|iPhone\|iPad\|iPod\/i\.test\(navigator\.userAgent\)/)
  assert.match(source, /<button v-if="!isMobileDevice" @click\.stop="copyImageToClipboard\(lightboxSrc\)"/)

  const toolsSectionMatch = source.match(/<!-- Tools -->[\s\S]*?<!-- Close -->/)
  assert.ok(toolsSectionMatch, 'expected to find the overlay tools section')

  const downloadButtonMatch = toolsSectionMatch[0].match(/<!-- Download -->\s*<button([^>]*)@click\.stop="downloadImage\(lightboxSrc\)"([^>]*)>/)
  assert.ok(downloadButtonMatch, 'expected the download button to be rendered in the tools section')
  assert.doesNotMatch(downloadButtonMatch[0], /\bv-if=/)
  assert.doesNotMatch(downloadButtonMatch[0], /isMobileDevice/)

  assert.match(source, /copyImageToClipboard/)
})
