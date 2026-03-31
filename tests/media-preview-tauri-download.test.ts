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

const extractArrowFunction = (source: string, name: string) => {
  const signature = `const ${name} =`
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `Could not find ${name}`)

  const paramsStart = source.indexOf('(', start)
  const paramsEnd = source.indexOf(')', paramsStart)
  const bodyStart = source.indexOf('{', paramsEnd)
  assert.notEqual(paramsStart, -1, `Could not find params for ${name}`)
  assert.notEqual(paramsEnd, -1, `Could not find params end for ${name}`)
  assert.notEqual(bodyStart, -1, `Could not find body for ${name}`)

  let depth = 0
  let bodyEnd = -1
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        bodyEnd = i
        break
      }
    }
  }

  assert.notEqual(bodyEnd, -1, `Could not find body end for ${name}`)

  const params = source
    .slice(paramsStart + 1, paramsEnd)
    .replace(/:\s*[^,)=]+/g, '')
    .trim()
  const body = source.slice(bodyStart + 1, bodyEnd)

  return new Function(`return (${params}) => {${body}}`)()
}

const shouldUseWebDownloadFallbackForUserAgent = extractArrowFunction(
  mediaPreviewSource,
  'shouldUseWebDownloadFallbackForUserAgent'
) as (userAgent: string) => boolean
const getImageExtension = extractArrowFunction(mediaPreviewSource, 'getImageExtension') as (mimeType: string) => string
const ensureFileExtension = extractArrowFunction(mediaPreviewSource, 'ensureFileExtension') as (fileName: string, extension: string) => string

test('media preview writes Tauri downloads to BaseDirectory.Download and keeps browser download logic', () => {
  assert.match(mediaPreviewSource, /from '@tauri-apps\/plugin-fs'/)
  assert.match(mediaPreviewSource, /BaseDirectory\.Download/)
  assert.match(mediaPreviewSource, /writeFile\(fileName, bytes, \{\s*baseDir: BaseDirectory\.Download\s*\}\)/)
  assert.match(mediaPreviewSource, /typeof window === 'undefined'/)
  assert.match(mediaPreviewSource, /__TAURI_INTERNALS__|__TAURI__/)
  assert.match(mediaPreviewSource, /document\.createElement\('a'\)/)
  assert.match(mediaPreviewSource, /shouldUseWebDownloadFallback/)
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
  assert.equal(getImageExtension('image/svg+xml'), 'svg+xml')
  assert.equal(getImageExtension('application/pdf'), 'bin')

  assert.equal(ensureFileExtension('photo.png', 'jpg'), 'photo.png')
  assert.equal(ensureFileExtension('photo', 'jpg'), 'photo.jpg')
})

test('download success toasts mention saving the image', () => {
  assert.match(enSource, /downloadImageSuccess:\s*'Image saved to Downloads'/)
  assert.match(zhSource, /downloadImageSuccess:\s*'图片已保存到下载目录'/)
})
