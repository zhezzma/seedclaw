import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const markdownRendererSource = readFileSync(
  path.join(repoRoot, 'src/components/chat/MarkdownRenderer.vue'),
  'utf8',
)

test('Markdown images open the shared media preview when clicked', () => {
  assert.match(markdownRendererSource, /useMediaPreview/)
  assert.match(markdownRendererSource, /target instanceof HTMLImageElement/)
  assert.match(markdownRendererSource, /openLightbox\(target\.currentSrc \|\| target\.src\)/)
  assert.match(markdownRendererSource, /@click="handleContentClick"/)
})

test('Markdown images expose the same hover download action as chat images', () => {
  assert.match(markdownRendererSource, /downloadImage/)
  assert.match(markdownRendererSource, /data-markdown-image-download/)
  assert.match(markdownRendererSource, /downloadImage\(image\.currentSrc \|\| image\.src\)/)
  assert.match(markdownRendererSource, /\.markdown-image-preview:hover/)
  assert.match(markdownRendererSource, /\.markdown-image-preview:focus-within/)
  assert.match(markdownRendererSource, /\[data-markdown-image-download\] svg[\s\S]*?width:\s*1rem[\s\S]*?height:\s*1rem/)
})

test('Markdown image controls preserve valid linked-image markup and keyboard preview', () => {
  assert.match(markdownRendererSource, /image\.closest\('a'\)/)
  assert.match(markdownRendererSource, /wrapper\.appendChild\(previewTarget\)/)
  assert.match(markdownRendererSource, /wrapper\.appendChild\(downloadButton\)/)
  assert.match(markdownRendererSource, /@keydown="handleContentKeydown"/)
  assert.match(markdownRendererSource, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.doesNotMatch(markdownRendererSource, /addMarkdownImageActions/)
})
