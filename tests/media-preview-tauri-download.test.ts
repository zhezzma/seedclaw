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

test('media preview writes Tauri downloads to BaseDirectory.Download and keeps web anchor fallback', () => {
  assert.match(mediaPreviewSource, /from '@tauri-apps\/plugin-fs'/)
  assert.match(mediaPreviewSource, /BaseDirectory\.Download/)
  assert.match(mediaPreviewSource, /await writeFile\(fileName, bytes, \{\s*baseDir: BaseDirectory\.Download\s*\}\)/)
  assert.match(mediaPreviewSource, /const isTauriApp = !!\(window as any\)\.__TAURI_INTERNALS__ \|\| !!\(window as any\)\.__TAURI__/)
  assert.match(mediaPreviewSource, /const getImageExtension = \(mimeType: string\)/)
  assert.match(mediaPreviewSource, /const ensureFileExtension = \(fileName: string, extension: string\)/)
  assert.match(mediaPreviewSource, /const a = document\.createElement\('a'\)/)
  assert.doesNotMatch(mediaPreviewSource, /isAndroidWebView/)
})

test('download toasts mention saving instead of opening a new tab', () => {
  assert.match(enSource, /downloadImageSuccess: 'Image saved to Downloads'/)
  assert.match(zhSource, /downloadImageSuccess: '图片已保存到下载目录'/)
})
