import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const mediaPreviewSource = readFileSync(path.join(repoRoot, 'src/composables/useMediaPreview.ts'), 'utf8')
const mediaDownloadSource = readFileSync(path.join(repoRoot, 'src/utils/mediaDownload.ts'), 'utf8')
const enSource = readFileSync(path.join(repoRoot, 'src/i18n/en.ts'), 'utf8')
const zhSource = readFileSync(path.join(repoRoot, 'src/i18n/zh.ts'), 'utf8')

const {
  shouldUseWebDownloadFallbackForUserAgent,
  getImageExtension,
  ensureFileExtension
} = await import(pathToFileURL(path.join(repoRoot, 'src/utils/mediaDownload.ts')).href)

test('media preview writes Tauri downloads via getTauriDownloadTarget and keeps browser download logic', () => {
  assert.match(mediaPreviewSource, /from '@tauri-apps\/plugin-fs'/)
  assert.match(mediaPreviewSource, /from '\.\.\/utils\/mediaDownload'/)
  assert.match(mediaPreviewSource, /BaseDirectory\.Download/)
  assert.match(mediaPreviewSource, /BaseDirectory\.Home/)
  assert.match(mediaPreviewSource, /getTauriDownloadTarget/)
  assert.match(mediaPreviewSource, /writeFile\(target\.path, bytes, \{\s*baseDir: target\.baseDir\s*\}\)/)
  assert.match(mediaPreviewSource, /isAndroidTauri/)
  assert.match(mediaPreviewSource, /typeof window === 'undefined'/)
  assert.match(mediaPreviewSource, /__TAURI_INTERNALS__|__TAURI__/)
  assert.match(mediaPreviewSource, /document\.createElement\('a'\)/)
  assert.match(mediaPreviewSource, /shouldUseWebDownloadFallback/)
  assert.doesNotMatch(mediaPreviewSource, /isTauriApp\(\)[\s\S]{0,300}window\.open/)
})

test('tauri download path no longer opens a new tab for mobile webview workarounds', () => {
  assert.doesNotMatch(mediaPreviewSource, /window\.open\(url, '_blank'\)/)
})

test('web download fallback detection handles Android WebView, normal Android Chrome, and iOS Safari', () => {
  const androidWebViewUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.86 Mobile Safari/537.36'
  const androidChromeUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.86 Mobile Safari/537.36'
  const iosSafariUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  const androidVersionSafariUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36'

  assert.equal(shouldUseWebDownloadFallbackForUserAgent(androidWebViewUa), true)
  assert.equal(shouldUseWebDownloadFallbackForUserAgent(androidChromeUa), false)
  assert.equal(shouldUseWebDownloadFallbackForUserAgent(iosSafariUa), true)
  assert.equal(shouldUseWebDownloadFallbackForUserAgent(androidVersionSafariUa), false)
  assert.doesNotMatch(mediaDownloadSource, /Version\//)
})

test('image extension helpers normalize MIME types and preserve existing file extensions', () => {
  assert.equal(getImageExtension('image/jpeg'), 'jpg')
  assert.equal(getImageExtension('image/webp'), 'webp')
  assert.equal(getImageExtension('image/svg+xml'), 'svg')
  assert.equal(getImageExtension('application/pdf'), 'bin')

  assert.equal(ensureFileExtension('photo.png', 'jpg'), 'photo.png')
  assert.equal(ensureFileExtension('photo', 'jpg'), 'photo.jpg')
})

test('download success toasts mention saving the image with path', () => {
  assert.match(enSource, /downloadImageSuccess:\s*'Image saved: \{path\}'/)
  assert.match(zhSource, /downloadImageSuccess:\s*'图片已保存: \{path\}'/)
})
