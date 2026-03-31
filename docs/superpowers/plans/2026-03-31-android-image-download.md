# Android Image Download to Download Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 SeedClaw 在所有 Tauri 平台把图片下载真正写入 `Download` 目录，同时移动端隐藏图片复制按钮，纯 Web 保留浏览器下载。

**Architecture:** 保留 `useMediaPreview().downloadImage(...)` 作为唯一下载入口，在函数内部按运行时环境分流：Tauri 走 `@tauri-apps/plugin-fs` 写入 `BaseDirectory.Download`，纯 Web 继续走 `<a download>`。图片复制逻辑不重构，只在 `MediaPreviewOverlay.vue` 中按移动端 UA 隐藏复制按钮。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tauri v2, `@tauri-apps/plugin-fs`, Rust plugin init, node:test 源码结构断言测试, Tailwind/daisyUI

---

### Task 1: 接入 Tauri fs 插件与 Download 目录权限

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Test: `tests/tauri-fs-download-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')

const packageJson = readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
const cargoToml = readFileSync(path.join(repoRoot, 'src-tauri/Cargo.toml'), 'utf8')
const libRs = readFileSync(path.join(repoRoot, 'src-tauri/src/lib.rs'), 'utf8')
const capability = readFileSync(path.join(repoRoot, 'src-tauri/capabilities/default.json'), 'utf8')
const manifest = readFileSync(path.join(repoRoot, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), 'utf8')

test('tauri download stack includes fs plugin, scoped Download permission, and android storage permissions', () => {
  assert.match(packageJson, /"@tauri-apps\/plugin-fs"\s*:/)
  assert.match(cargoToml, /tauri-plugin-fs\s*=\s*"2"/)
  assert.match(libRs, /\.plugin\(tauri_plugin_fs::init\(\)\)/)
  assert.match(capability, /"fs:allow-write-file"/)
  assert.match(capability, /\$DOWNLOAD\/\*/)
  assert.match(manifest, /android\.permission\.READ_EXTERNAL_STORAGE/)
  assert.match(manifest, /android\.permission\.WRITE_EXTERNAL_STORAGE/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tauri-fs-download-config.test.ts`
Expected: FAIL because fs plugin dependency and Download permission are not configured yet.

- [ ] **Step 3: Write minimal implementation**

```bash
npm install @tauri-apps/plugin-fs
cd src-tauri && cargo add tauri-plugin-fs@2
```

```json
{
  "dependencies": {
    "@tauri-apps/plugin-fs": "^2"
  }
}
```

```toml
[dependencies]
tauri-plugin-fs = "2"
```

```rust
builder
    .plugin(
        tauri_plugin_log::Builder::new()
            .level(tauri_plugin_log::log::LevelFilter::Info)
            .build(),
    )
    .plugin(tauri_plugin_websocket::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_fs::init())
```

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "websocket:default",
    "notification:default",
    "notification:allow-register-listener",
    "notification:allow-register-action-types",
    "log:default",
    {
      "identifier": "fs:allow-write-file",
      "allow": [
        {
          "path": "$DOWNLOAD/*"
        }
      ]
    }
  ]
}
```

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/tauri-fs-download-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/gen/android/app/src/main/AndroidManifest.xml tests/tauri-fs-download-config.test.ts
git commit -m "feat(tauri): add fs download permissions"
```

### Task 2: 将图片下载逻辑切到 Tauri Download 目录并保留 Web 下载分支

**Files:**
- Modify: `src/composables/useMediaPreview.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh.ts`
- Test: `tests/media-preview-tauri-download.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
  assert.match(mediaPreviewSource, /const isTauriApp = !!\(window as any\)__TAURI_INTERNALS__ \|\| !!\(window as any\)__TAURI__/)
  assert.match(mediaPreviewSource, /const getImageExtension = \(mimeType: string\)/)
  assert.match(mediaPreviewSource, /const ensureFileExtension = \(fileName: string, extension: string\)/)
  assert.match(mediaPreviewSource, /const a = document\.createElement\('a'\)/)
  assert.doesNotMatch(mediaPreviewSource, /isAndroidWebView/)
})

test('download toasts mention saving instead of opening a new tab', () => {
  assert.match(enSource, /downloadImageSuccess: 'Image saved to Downloads'/)
  assert.match(zhSource, /downloadImageSuccess: '图片已保存到下载目录'/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/media-preview-tauri-download.test.ts`
Expected: FAIL because `useMediaPreview.ts` still uses the old WebView-specific branch and success text still describes starting/opening downloads.

- [ ] **Step 3: Write minimal implementation**

```ts
import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'
import { ref } from 'vue'
import { useToast } from './useToast'

const isTauriApp = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__

const getImageExtension = (mimeType: string) => {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  return 'png'
}

const ensureFileExtension = (fileName: string, extension: string) => {
  return /\.[a-z0-9]+$/i.test(fileName) ? fileName : `${fileName}.${extension}`
}

const downloadImage = async (src: string, defaultName?: string) => {
  const toast = useToast()
  const { i18n } = await import('../i18n')
  const _t = (key: string) => i18n.global.t(key)

  try {
    const response = await fetch(src)
    const blob = await response.blob()
    const extension = getImageExtension(blob.type)
    const fileName = ensureFileExtension(defaultName || `image-${Date.now()}`, extension)

    if (isTauriApp) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await writeFile(fileName, bytes, { baseDir: BaseDirectory.Download })
      toast.success(_t('chat.downloadImageSuccess'))
      return
    }

    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => window.URL.revokeObjectURL(url), 5000)
    toast.success(_t('chat.downloadImageSuccess'))
  } catch (error) {
    console.error('Download failed:', error)
    toast.error(_t('chat.downloadImageFailed'))
  }
}
```

```ts
chat: {
  downloadImage: 'Download Image',
  downloadImageSuccess: 'Image saved to Downloads',
  downloadImageFailed: 'Download failed, please try again',
}
```

```ts
chat: {
  downloadImage: '下载图片',
  downloadImageSuccess: '图片已保存到下载目录',
  downloadImageFailed: '下载失败，请稍后重试',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/media-preview-tauri-download.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useMediaPreview.ts src/i18n/en.ts src/i18n/zh.ts tests/media-preview-tauri-download.test.ts
git commit -m "feat(media): save tauri image downloads to downloads"
```

### Task 3: 移动端隐藏图片复制按钮并保留桌面端复制入口

**Files:**
- Modify: `src/components/chat/MediaPreviewOverlay.vue`
- Test: `tests/media-preview-overlay-copy-visibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/media-preview-overlay-copy-visibility.test.ts`
Expected: FAIL because the copy button is currently always rendered.

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMediaPreview } from '../../composables/useMediaPreview'

const { t } = useI18n()
const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

const {
  lightboxOpen,
  lightboxSrc,
  imgScale,
  imgTranslateX,
  imgTranslateY,
  isDragging,
  isMouseDragging,
  closeLightbox,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleWheel,
  handleImageDblClick,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  downloadImage,
  copyImageToClipboard,
  fileViewerOpen,
  fileViewerName,
  fileViewerContent,
  closeFileViewer,
} = useMediaPreview()
</script>

<template>
  <button
    v-if="!isMobileDevice"
    @click.stop="copyImageToClipboard(lightboxSrc)"
    class="btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
    :title="t('chat.copyImage')"
  >
    <!-- existing copy icon -->
  </button>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/media-preview-overlay-copy-visibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MediaPreviewOverlay.vue tests/media-preview-overlay-copy-visibility.test.ts
git commit -m "feat(media): hide image copy button on mobile"
```

### Task 4: 运行针对性测试回归并整理最终交付

**Files:**
- Modify: `tests/tauri-fs-download-config.test.ts`
- Modify: `tests/media-preview-tauri-download.test.ts`
- Modify: `tests/media-preview-overlay-copy-visibility.test.ts`

- [ ] **Step 1: Tighten the tests to lock the final behavior**

```ts
test('tauri config keeps Download scope narrow', () => {
  assert.doesNotMatch(capability, /\$HOME\/\*\*/)
  assert.doesNotMatch(capability, /"fs:default"/)
})

test('tauri download path no longer opens a new tab for mobile webview workarounds', () => {
  assert.doesNotMatch(mediaPreviewSource, /window\.open\(url, '_blank'\)/)
  assert.doesNotMatch(mediaPreviewSource, /downloadImageOpenedHint/)
  assert.doesNotMatch(mediaPreviewSource, /downloadImageFallback/)
})

test('overlay still keeps the download button visible while gating copy only', () => {
  assert.match(source, /@click\.stop="downloadImage\(lightboxSrc\)"/)
  assert.match(source, /v-if="!isMobileDevice"/)
})
```

- [ ] **Step 2: Run the targeted regression suite**

Run: `node --experimental-strip-types --test tests/tauri-fs-download-config.test.ts tests/media-preview-tauri-download.test.ts tests/media-preview-overlay-copy-visibility.test.ts`
Expected: PASS (3 files, all tests green)

- [ ] **Step 3: Make any final source cleanups revealed by the tests**

```ts
// Remove unused strings once the source-assertion tests confirm no callers remain.
// src/i18n/en.ts
// delete: downloadImageOpenedHint, downloadImageFallback

// src/i18n/zh.ts
// delete: downloadImageOpenedHint, downloadImageFallback
```

```ts
// Keep download behavior single-path for Tauri and single-path for Web.
// Do not reintroduce UA-specific download branches in useMediaPreview.ts.
```

- [ ] **Step 4: Re-run the targeted regression suite**

Run: `node --experimental-strip-types --test tests/tauri-fs-download-config.test.ts tests/media-preview-tauri-download.test.ts tests/media-preview-overlay-copy-visibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/tauri-fs-download-config.test.ts tests/media-preview-tauri-download.test.ts tests/media-preview-overlay-copy-visibility.test.ts src/i18n/en.ts src/i18n/zh.ts src/composables/useMediaPreview.ts src/components/chat/MediaPreviewOverlay.vue
git commit -m "test(media): lock tauri download and mobile copy behavior"
```
