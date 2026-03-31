import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const mediaPreviewSource = readFileSync(path.join(repoRoot, 'src/composables/useMediaPreview.ts'), 'utf8')
const enSource = readFileSync(path.join(repoRoot, 'src/i18n/en.ts'), 'utf8')
const zhSource = readFileSync(path.join(repoRoot, 'src/i18n/zh.ts'), 'utf8')

const tempModuleDir = mkdtempSync(path.join(os.tmpdir(), 'media-preview-test-'))
const tempModulePath = path.join(tempModuleDir, 'useMediaPreview.testable.ts')
const testableModuleSource = mediaPreviewSource
  .replace(
    "import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'",
    "const BaseDirectory = { Download: 'Download' }\nconst writeFile = async () => {}"
  )
  .replace(
    "import { ref } from 'vue'",
    "const ref = (value: unknown) => ({ value })"
  )
  .replace(
    "import { useToast } from './useToast'",
    "const useToast = () => ({ success: () => {}, error: () => {} })"
  )

writeFileSync(tempModulePath, testableModuleSource)

const {
  shouldUseWebDownloadFallbackForUserAgent,
  getImageExtension,
  ensureFileExtension
} = await import(pathToFileURL(tempModulePath).href)

test('media preview writes Tauri downloads to BaseDirectory.Download and keeps browser download logic', () => {
  assert.match(mediaPreviewSource, /from '@tauri-apps\/plugin-fs'/)
  assert.match(mediaPreviewSource, /BaseDirectory\.Download/)
  assert.match(mediaPreviewSource, /writeFile\(fileName, bytes, \{\s*baseDir: BaseDirectory\.Download\s*\}\)/)
  assert.match(mediaPreviewSource, /typeof window === 'undefined'/)
  assert.match(mediaPreviewSource, /__TAURI_INTERNALS__|__TAURI__/)
  assert.match(mediaPreviewSource, /document\.createElement\('a'\)/)
  assert.match(mediaPreviewSource, /shouldUseWebDownloadFallback/)
  assert.match(mediaPreviewSource, /hasVersionedSafariSignature/)
  assert.doesNotMatch(mediaPreviewSource, /isTauriApp\(\)[\s\S]{0,300}window\.open/)
})

test('web download fallback detection handles Android WebView, normal Android Chrome, and iOS Safari', () => {
  const androidWebViewUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.86 Mobile Safari/537.36'
  const androidChromeUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.86 Mobile Safari/537.36'
  const iosSafariUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

  assert.equal(shouldUseWebDownloadFallbackForUserAgent(androidWebViewUa), true)
  assert.equal(shouldUseWebDownloadFallbackForUserAgent(androidChromeUa), false)
  assert.equal(shouldUseWebDownloadFallbackForUserAgent(iosSafariUa), true)
})

test('image extension helpers normalize MIME types and preserve existing file extensions', () => {
  assert.equal(getImageExtension('image/jpeg'), 'jpg')
  assert.equal(getImageExtension('image/webp'), 'webp')
  assert.equal(getImageExtension('image/svg+xml'), 'svg')
  assert.equal(getImageExtension('application/pdf'), 'bin')

  assert.equal(ensureFileExtension('photo.png', 'jpg'), 'photo.png')
  assert.equal(ensureFileExtension('photo', 'jpg'), 'photo.jpg')
})

test('download success toasts mention saving the image', () => {
  assert.match(enSource, /downloadImageSuccess:\s*'Image saved to Downloads'/)
  assert.match(zhSource, /downloadImageSuccess:\s*'图片已保存到下载目录'/)
})
