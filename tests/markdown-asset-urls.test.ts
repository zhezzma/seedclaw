import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveMarkdownImageUrls, resolveMediaUrl } from '../src/utils/media-url.ts'

test('resolves non-http media URLs against apiBaseUrl', () => {
  assert.equal(
    resolveMediaUrl('/assets/images/session/id/image.png', 'http://tauri.localhost/'),
    'http://tauri.localhost/assets/images/session/id/image.png',
  )
  assert.equal(
    resolveMediaUrl('images/local.png', 'https://agent.example.com/api'),
    'https://agent.example.com/api/images/local.png',
  )
})

test('does not rewrite http, data, or blob media URLs', () => {
  for (const url of [
    'https://example.com/a.png',
    'http://example.com/a.png',
    'data:image/png;base64,abc',
    'blob:http://localhost/id',
  ]) {
    assert.equal(resolveMediaUrl(url, 'http://tauri.localhost'), url)
  }
})

test('rewrites Markdown img src values with the shared media URL resolver', () => {
  const html = '<p><img src="images/local.png"><img src="https://example.com/a.png"></p>'
  assert.equal(
    resolveMarkdownImageUrls(html, 'http://tauri.localhost'),
    '<p><img src="http://tauri.localhost/images/local.png"><img src="https://example.com/a.png"></p>',
  )
})
test('leaves relative URLs unchanged when apiBaseUrl is empty', () => {
  assert.equal(resolveMediaUrl('/assets/a.png', ''), '/assets/a.png')
})
