import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const mediaPreviewSource = readFileSync(path.join(repoRoot, 'src/composables/useMediaPreview.ts'), 'utf8')
const enSource = readFileSync(path.join(repoRoot, 'src/i18n/en.ts'), 'utf8')
const zhSource = readFileSync(path.join(repoRoot, 'src/i18n/zh.ts'), 'utf8')

test('media preview writes Tauri downloads to BaseDirectory.Download and keeps browser download logic', () => {
  assert.match(mediaPreviewSource, /from '@tauri-apps\/plugin-fs'/)
  assert.match(mediaPreviewSource, /BaseDirectory\.Download/)
  assert.match(mediaPreviewSource, /writeFile\(fileName, bytes, \{\s*baseDir: BaseDirectory\.Download\s*\}\)/)
  assert.match(mediaPreviewSource, /typeof window === 'undefined'/)
  assert.match(mediaPreviewSource, /__TAURI_INTERNALS__|__TAURI__/)
  assert.match(mediaPreviewSource, /getImageExtension/)
  assert.match(mediaPreviewSource, /ensureFileExtension/)
  assert.match(mediaPreviewSource, /document\.createElement\('a'\)/)
  assert.match(mediaPreviewSource, /shouldUseWebDownloadFallback/)
  assert.doesNotMatch(mediaPreviewSource, /isTauriApp\(\)[\s\S]{0,300}window\.open/)
})

test('download success toasts mention saving the image', () => {
  assert.match(enSource, /downloadImageSuccess:\s*'Image saved to Downloads'/)
  assert.match(zhSource, /downloadImageSuccess:\s*'图片已保存到下载目录'/)
})
