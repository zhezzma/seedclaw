import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveMarkdownResourceUrls, resolveMediaUrl } from '../src/utils/media-url.ts'

test('resolves non-http media URLs against apiBaseUrl', () => {
  assert.equal(
    resolveMediaUrl('/assets/images/session/id/image.png', 'http://tauri.localhost/'),
    'http://tauri.localhost/assets/images/session/id/image.png',
  )
  assert.equal(
    resolveMediaUrl('images/local.png', 'https://agent.example.com/api'),
    'https://agent.example.com/api/images/local.png',
  )
  assert.equal(
    resolveMediaUrl('./images/local.png', 'https://agent.example.com/api'),
    'https://agent.example.com/api/./images/local.png',
  )
  assert.equal(
    resolveMediaUrl('../images/local.png', 'https://agent.example.com/api'),
    'https://agent.example.com/api/../images/local.png',
  )
})

test('does not rewrite absolute schemes, fragments, or protocol-relative URLs', () => {
  for (const url of [
    'https://example.com/a.png',
    'http://example.com/a.png',
    'mailto:user@example.com',
    'tel:+123456789',
    'data:image/png;base64,abc',
    'blob:http://localhost/id',
    '#section',
    '//cdn.example.com/a.png',
  ]) {
    assert.equal(resolveMediaUrl(url, 'http://tauri.localhost'), url)
  }
})

test('rewrites Markdown img src values with the shared media URL resolver', () => {
  const html = '<p><img src="images/local.png"><img src="https://example.com/a.png"></p>'
  assert.equal(
    resolveMarkdownResourceUrls(html, 'http://tauri.localhost'),
    '<p><img src="http://tauri.localhost/images/local.png"><img src="https://example.com/a.png"></p>',
  )
})

test('rewrites Markdown link href values with the shared media URL resolver', () => {
  const html = '<p><a href="/assets/images/session/id/image.png">查看原图</a></p>'
  assert.equal(
    resolveMarkdownResourceUrls(html, 'http://tauri.localhost'),
    '<p><a href="http://tauri.localhost/assets/images/session/id/image.png">查看原图</a></p>',
  )
})

test('rewrites actual resource attributes without changing attribute-like metadata', () => {
  const html = `<p><a title="href='before'" href="docs/file.md" data-note="href='after'">文档</a><img alt="src='before.png'" src="images/a.png" title="src='after.png'"></p>`
  assert.equal(
    resolveMarkdownResourceUrls(html, 'http://tauri.localhost'),
    `<p><a title="href='before'" href="http://tauri.localhost/docs/file.md" data-note="href='after'">文档</a><img alt="src='before.png'" src="http://tauri.localhost/images/a.png" title="src='after.png'"></p>`,
  )
})

test('does not treat quoted tag delimiters or metadata as resource attributes', () => {
  const html = `<a title="before href='metadata' > after" href="docs/file.md">文档</a>`
  assert.equal(
    resolveMarkdownResourceUrls(html, 'http://tauri.localhost'),
    `<a title="before href='metadata' > after" href="http://tauri.localhost/docs/file.md">文档</a>`,
  )
})

test('leaves non-relative Markdown resource URLs unchanged', () => {
  const html = '<p><a href="mailto:user@example.com">邮件</a><a href="#section">章节</a><img src="//cdn.example.com/a.png"></p>'
  assert.equal(resolveMarkdownResourceUrls(html, 'http://tauri.localhost'), html)
})

test('leaves relative URLs unchanged when apiBaseUrl is empty', () => {
  assert.equal(resolveMediaUrl('/assets/a.png', ''), '/assets/a.png')
  const html = '<p><a href="/assets/a.png">资源</a><img src="images/a.png"></p>'
  assert.equal(resolveMarkdownResourceUrls(html, ''), html)
})
