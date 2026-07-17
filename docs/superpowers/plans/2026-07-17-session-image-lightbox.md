# Session Image Lightbox Navigation and Mobile Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users browse every loaded image in the current chat session with lightbox buttons or keyboard arrows, and share the current image through the native mobile share sheet.

**Architecture:** Derive a deterministic gallery from `processedMessages` rather than mounted DOM so virtual scrolling cannot omit off-screen images. Synchronize that gallery into the singleton media-preview composable, which owns active-gallery navigation, keyboard behavior, zoom resets, and sharing; keep the overlay limited to lifecycle wiring and controls.

**Tech Stack:** Vue 3 Composition API, TypeScript 5.6, MarkdownIt, Vue I18n, Node built-in test runner with experimental TypeScript stripping, Web Share API.

## Global Constraints

- Include structured message images plus images rendered from normal Markdown and thinking blocks.
- Exclude unsent chat-input attachments and unrelated application images.
- Preserve display order and de-duplicate repeated URLs by first occurrence.
- Previous/next navigation wraps at both ends and resets zoom/pan.
- Show navigation controls only for active galleries containing at least two images.
- Show the share control only on mobile under the overlay's existing user-agent rule.
- Prefer native file sharing; fall back to URL sharing only for HTTP(S) sources.
- Treat `AbortError` from the native share sheet as silent user cancellation.
- Add no new dependencies and do not refactor unrelated media behavior.

---

## File Map

- Create `src/utils/session-image-gallery.ts`: pure extraction of ordered, unique image URLs from processed session messages.
- Create `tests/session-image-gallery.test.ts`: behavioral tests for structured, Markdown, thinking, relative, base64, and duplicate image sources.
- Modify `src/composables/useMediaPreview.ts`: active gallery, circular navigation, keyboard handling, and mobile sharing.
- Create `tests/media-preview-navigation.test.ts`: composable navigation and keyboard behavior.
- Create `tests/media-preview-sharing.test.ts`: file-share, URL fallback, and cancellation behavior.
- Modify `src/views/HomeView.vue`: compute and synchronize the current session gallery.
- Create `tests/media-preview-session-gallery-wiring.test.ts`: source contract for HomeView integration.
- Modify `src/components/chat/MediaPreviewOverlay.vue`: previous/next controls, keyboard listener lifecycle, and mobile share control.
- Create `tests/media-preview-overlay-navigation.test.ts`: source contract for overlay controls and lifecycle wiring.
- Modify `src/i18n/zh.ts`: Chinese labels and sharing error text.
- Modify `src/i18n/en.ts`: English labels and sharing error text.

---

### Task 1: Derive the Current Session Image Gallery

**Files:**
- Create: `src/utils/session-image-gallery.ts`
- Create: `tests/session-image-gallery.test.ts`

**Interfaces:**
- Consumes: `DisplayMessage` from `src/composables/useChatMessages.ts`, `createMarkdownItInstance()` from `src/utils/markdown/markdown-config.ts`, and `resolveMediaUrl(url, apiBaseUrl)` from `src/utils/media-url.ts`.
- Produces: `collectSessionImageSources(messages: DisplayMessage[], apiBaseUrl: string): string[]`.

- [ ] **Step 1: Write the failing gallery tests**

Create `tests/session-image-gallery.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { DisplayMessage } from '../src/composables/useChatMessages.ts'
import { collectSessionImageSources } from '../src/utils/session-image-gallery.ts'

const messages: DisplayMessage[] = [
    {
        id: 'user-1',
        role: 'user',
        blocks: [
            {
                type: 'text',
                text: '![first](/media/first.png)\n![second](https://cdn.example.com/second.jpg)',
            },
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/webp',
                    data: 'AAAA',
                },
            },
        ],
    },
    {
        id: 'assistant-1',
        role: 'assistant',
        blocks: [
            {
                type: 'thinking',
                text: '![third](media/third.png)',
            },
            {
                type: 'image',
                source: {
                    type: 'url',
                    url: 'https://cdn.example.com/second.jpg',
                },
            },
            {
                type: 'tool',
                toolName: 'ignored',
            },
        ],
    },
]

test('collects structured, Markdown, and thinking images in display order', () => {
    assert.deepEqual(
        collectSessionImageSources(messages, 'https://api.example.com/'),
        [
            'https://api.example.com/media/first.png',
            'https://cdn.example.com/second.jpg',
            'data:image/webp;base64,AAAA',
            'https://api.example.com/media/third.png',
        ],
    )
})

test('keeps only the first occurrence of a repeated image URL', () => {
    const repeated: DisplayMessage[] = [
        {
            id: 'assistant-2',
            role: 'assistant',
            blocks: [
                { type: 'text', text: '![one](https://example.com/a.png)' },
                {
                    type: 'image',
                    source: { type: 'url', url: 'https://example.com/a.png' },
                },
            ],
        },
    ]

    assert.deepEqual(
        collectSessionImageSources(repeated, ''),
        ['https://example.com/a.png'],
    )
})

test('returns an empty gallery when messages have no rendered images', () => {
    assert.deepEqual(
        collectSessionImageSources([
            {
                id: 'assistant-3',
                role: 'assistant',
                blocks: [{ type: 'text', text: 'plain text' }],
            },
        ], ''),
        [],
    )
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test tests/session-image-gallery.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/session-image-gallery.ts`.

- [ ] **Step 3: Implement the gallery collector**

Create `src/utils/session-image-gallery.ts`:

```ts
import type { DisplayBlock, DisplayMessage } from '../composables/useChatMessages.ts'
import { createMarkdownItInstance } from './markdown/markdown-config.ts'
import { resolveMediaUrl } from './media-url.ts'

const galleryMarkdown = createMarkdownItInstance()

type MarkdownTokenLike = {
    type: string
    content: string
    children?: MarkdownTokenLike[] | null
    attrGet: (name: string) => string | null
}

const extractMarkdownImageSources = (text: string): string[] => {
    const sources: string[] = []

    const visit = (tokens: MarkdownTokenLike[]) => {
        for (const token of tokens) {
            if (token.type === 'image') {
                const source = token.attrGet('src')
                if (source) sources.push(source)
            }

            if (token.children) visit(token.children)
        }
    }

    visit(galleryMarkdown.parse(text || '', {}) as MarkdownTokenLike[])
    return sources
}

const getStructuredImageSource = (
    source: DisplayBlock['source'],
    apiBaseUrl: string,
): string => {
    if (!source) return ''

    const url = source.url || (source.type === 'url' ? source.data : '')
    if (url) return resolveMediaUrl(url, apiBaseUrl) || ''

    const data = source.data || ''
    if (!data) return ''
    if (data.startsWith('data:') || /^https?:\/\//i.test(data)) return data

    return `data:${source.media_type || 'image/png'};base64,${data}`
}

export const collectSessionImageSources = (
    messages: DisplayMessage[],
    apiBaseUrl: string,
): string[] => {
    const result: string[] = []
    const seen = new Set<string>()

    const append = (source: string | undefined) => {
        const resolved = resolveMediaUrl(source, apiBaseUrl) || ''
        if (!resolved || seen.has(resolved)) return
        seen.add(resolved)
        result.push(resolved)
    }

    for (const message of messages) {
        for (const block of message.blocks || []) {
            if (block.type === 'image') {
                append(getStructuredImageSource(block.source, apiBaseUrl))
                continue
            }

            if ((block.type === 'text' || block.type === 'thinking') && block.text) {
                for (const source of extractMarkdownImageSources(block.text)) {
                    append(source)
                }
            }
        }
    }

    return result
}
```

- [ ] **Step 4: Run the gallery tests and verify GREEN**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test tests/session-image-gallery.test.ts
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Run type checking for the new utility**

Run:

```bash
cd D:/Workspace/seedclaw
npm run tcs
```

Expected: both `vue-tsc --noEmit` and `tsc --noEmit --skipLibCheck` exit 0.

- [ ] **Step 6: Commit the gallery collector**

```bash
cd D:/Workspace/seedclaw
git add src/utils/session-image-gallery.ts tests/session-image-gallery.test.ts
git commit -m "feat(media): collect session image gallery"
```

---

### Task 2: Add Circular Lightbox Navigation and Keyboard Behavior

**Files:**
- Modify: `src/composables/useMediaPreview.ts`
- Create: `tests/media-preview-navigation.test.ts`

**Interfaces:**
- Consumes: session gallery URL arrays supplied by HomeView in Task 3.
- Produces: `lightboxSources`, `lightboxIndex`, `canNavigateLightbox`, `setLightboxSources(sources)`, `showPreviousImage()`, `showNextImage()`, and `handleLightboxKeydown(event)` through `useMediaPreview()`.

- [ ] **Step 1: Write failing navigation tests**

Create `tests/media-preview-navigation.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { useMediaPreview } from '../src/composables/useMediaPreview.ts'

const mediaPreview = useMediaPreview()

const resetPreview = () => {
    mediaPreview.closeLightbox()
    mediaPreview.setLightboxSources([])
}

test.beforeEach(resetPreview)
test.afterEach(resetPreview)

test('opens at the matching session image and wraps in both directions', () => {
    mediaPreview.setLightboxSources(['one.png', 'two.png', 'three.png'])
    mediaPreview.openLightbox('two.png')

    assert.deepEqual(mediaPreview.lightboxSources.value, ['one.png', 'two.png', 'three.png'])
    assert.equal(mediaPreview.lightboxIndex.value, 1)
    assert.equal(mediaPreview.canNavigateLightbox.value, true)

    mediaPreview.showNextImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'three.png')

    mediaPreview.showNextImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'one.png')

    mediaPreview.showPreviousImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'three.png')
})

test('opens a source outside the session as an isolated image', () => {
    mediaPreview.setLightboxSources(['session.png'])
    mediaPreview.openLightbox('unsent.png')

    assert.deepEqual(mediaPreview.lightboxSources.value, ['unsent.png'])
    assert.equal(mediaPreview.lightboxIndex.value, 0)
    assert.equal(mediaPreview.canNavigateLightbox.value, false)

    mediaPreview.showNextImage()
    assert.equal(mediaPreview.lightboxSrc.value, 'unsent.png')
})

test('keyboard arrows navigate only while a multi-image lightbox is open', () => {
    mediaPreview.setLightboxSources(['one.png', 'two.png'])

    let prevented = 0
    const right = {
        key: 'ArrowRight',
        preventDefault: () => { prevented += 1 },
    } as KeyboardEvent

    mediaPreview.handleLightboxKeydown(right)
    assert.equal(prevented, 0)

    mediaPreview.openLightbox('one.png')
    mediaPreview.handleLightboxKeydown(right)
    assert.equal(mediaPreview.lightboxSrc.value, 'two.png')
    assert.equal(prevented, 1)
})

test('switching images resets zoom and translation', () => {
    mediaPreview.setLightboxSources(['one.png', 'two.png'])
    mediaPreview.openLightbox('one.png')
    mediaPreview.imgScale.value = 3
    mediaPreview.imgTranslateX.value = 45
    mediaPreview.imgTranslateY.value = -20

    mediaPreview.showNextImage()

    assert.equal(mediaPreview.imgScale.value, 1)
    assert.equal(mediaPreview.imgTranslateX.value, 0)
    assert.equal(mediaPreview.imgTranslateY.value, 0)
})
```

- [ ] **Step 2: Run the navigation tests and verify RED**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test tests/media-preview-navigation.test.ts
```

Expected: FAIL because `setLightboxSources` and the new navigation state are not exported.

- [ ] **Step 3: Add gallery and navigation state to the composable**

In `src/composables/useMediaPreview.ts`, change the Vue import and add state beside `lightboxSrc`:

```ts
import { computed, ref } from 'vue'

const lightboxOpen = ref(false)
const lightboxSrc = ref('')
const sessionImageSources = ref<string[]>([])
const lightboxSources = ref<string[]>([])
const lightboxIndex = ref(-1)
const canNavigateLightbox = computed(() => lightboxSources.value.length > 1)
```

Add these functions after `toggleZoom` and replace `openLightbox` / `closeLightbox` with the complete block below:

```ts
const setLightboxSources = (sources: string[]) => {
    sessionImageSources.value = Array.from(new Set(sources.filter(Boolean)))

    if (!lightboxOpen.value) return

    const currentIndex = sessionImageSources.value.indexOf(lightboxSrc.value)
    if (currentIndex >= 0) {
        lightboxSources.value = sessionImageSources.value
        lightboxIndex.value = currentIndex
    }
}

const openLightbox = (src: string) => {
    resetZoomState()

    const sessionIndex = sessionImageSources.value.indexOf(src)
    lightboxSources.value = sessionIndex >= 0
        ? sessionImageSources.value
        : [src]
    lightboxIndex.value = sessionIndex >= 0 ? sessionIndex : 0
    lightboxSrc.value = src
    lightboxOpen.value = true
}

const switchLightboxImage = (offset: -1 | 1) => {
    if (!canNavigateLightbox.value) return

    const imageCount = lightboxSources.value.length
    const nextIndex = (lightboxIndex.value + offset + imageCount) % imageCount
    lightboxIndex.value = nextIndex
    lightboxSrc.value = lightboxSources.value[nextIndex]
    resetZoomState()
}

const showPreviousImage = () => switchLightboxImage(-1)
const showNextImage = () => switchLightboxImage(1)

const handleLightboxKeydown = (event: KeyboardEvent) => {
    if (!lightboxOpen.value || !canNavigateLightbox.value) return

    if (event.key === 'ArrowLeft') {
        event.preventDefault()
        showPreviousImage()
    } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        showNextImage()
    }
}

const closeLightbox = () => {
    lightboxOpen.value = false
    lightboxSrc.value = ''
    lightboxSources.value = []
    lightboxIndex.value = -1
    resetZoomState()
}
```

Add the new values to `_mediaPreviewState` immediately after `lightboxSrc` and `closeLightbox`:

```ts
    lightboxSources,
    lightboxIndex,
    canNavigateLightbox,
```

```ts
    setLightboxSources,
    showPreviousImage,
    showNextImage,
    handleLightboxKeydown,
```

- [ ] **Step 4: Run navigation and existing zoom tests and verify GREEN**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test \
  tests/media-preview-navigation.test.ts \
  tests/media-preview-overlay-mobile-double-tap.test.ts
```

Expected: 6 tests pass, 0 fail.

- [ ] **Step 5: Commit navigation state**

```bash
cd D:/Workspace/seedclaw
git add src/composables/useMediaPreview.ts tests/media-preview-navigation.test.ts
git commit -m "feat(media): add circular lightbox navigation"
```

---

### Task 3: Synchronize the Gallery from HomeView

**Files:**
- Modify: `src/views/HomeView.vue`
- Create: `tests/media-preview-session-gallery-wiring.test.ts`

**Interfaces:**
- Consumes: `collectSessionImageSources(processedMessages, apiBaseUrl)` from Task 1 and `setLightboxSources(sources)` from Task 2.
- Produces: a reactive, current-session gallery in the shared media preview state; clears it when HomeView unmounts.

- [ ] **Step 1: Write the failing HomeView wiring test**

Create `tests/media-preview-session-gallery-wiring.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const source = readFileSync(path.join(repoRoot, 'src/views/HomeView.vue'), 'utf8')

test('HomeView synchronizes processed session images into the shared lightbox', () => {
    assert.match(source, /import \{ collectSessionImageSources \} from '\.\.\/utils\/session-image-gallery'/)
    assert.match(source, /import \{ useMediaPreview \} from '\.\.\/composables\/useMediaPreview'/)
    assert.match(source, /const \{ setLightboxSources \} = useMediaPreview\(\)/)
    assert.match(
        source,
        /collectSessionImageSources\(processedMessages\.value, settingsStore\.apiBaseUrl\)/,
    )
    assert.match(source, /sources => setLightboxSources\(sources\)/)
    assert.match(source, /setLightboxSources\(\[\]\)/)
})
```

- [ ] **Step 2: Run the wiring test and verify RED**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test tests/media-preview-session-gallery-wiring.test.ts
```

Expected: FAIL because HomeView does not import or call the gallery APIs.

- [ ] **Step 3: Wire the current session gallery into HomeView**

In `src/views/HomeView.vue`, add imports with the other composable and utility imports:

```ts
import { useMediaPreview } from '../composables/useMediaPreview'
import { collectSessionImageSources } from '../utils/session-image-gallery'
```

Immediately after destructuring `processedMessages`, `isLoading`, `isBusy`, and `streamingText`, add:

```ts
const { setLightboxSources } = useMediaPreview()

watch(
    () => collectSessionImageSources(processedMessages.value, settingsStore.apiBaseUrl),
    sources => setLightboxSources(sources),
    { immediate: true },
)
```

Extend the existing `onUnmounted` block near the bottom of the script:

```ts
onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    window.removeEventListener('keydown', handleWorkspaceShortcut)
    setLightboxSources([])
})
```

- [ ] **Step 4: Run gallery and wiring tests and verify GREEN**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test \
  tests/session-image-gallery.test.ts \
  tests/media-preview-session-gallery-wiring.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Run type checking**

Run:

```bash
cd D:/Workspace/seedclaw
npm run tcs
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 6: Commit HomeView integration**

```bash
cd D:/Workspace/seedclaw
git add src/views/HomeView.vue tests/media-preview-session-gallery-wiring.test.ts
git commit -m "feat(media): sync session images to lightbox"
```

---

### Task 4: Add Overlay Buttons and Keyboard Listener Lifecycle

**Files:**
- Modify: `src/components/chat/MediaPreviewOverlay.vue`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Create: `tests/media-preview-overlay-navigation.test.ts`

**Interfaces:**
- Consumes: `canNavigateLightbox`, `showPreviousImage()`, `showNextImage()`, and `handleLightboxKeydown(event)` from Task 2.
- Produces: visible circular navigation controls and one properly cleaned-up window keydown listener.

- [ ] **Step 1: Write the failing overlay navigation test**

Create `tests/media-preview-overlay-navigation.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const overlay = readFileSync(
    path.join(repoRoot, 'src/components/chat/MediaPreviewOverlay.vue'),
    'utf8',
)
const zh = readFileSync(path.join(repoRoot, 'src/i18n/zh.ts'), 'utf8')
const en = readFileSync(path.join(repoRoot, 'src/i18n/en.ts'), 'utf8')

test('overlay renders previous and next controls only for navigable galleries', () => {
    assert.match(overlay, /v-if="canNavigateLightbox" @click\.stop="showPreviousImage"/)
    assert.match(overlay, /v-if="canNavigateLightbox" @click\.stop="showNextImage"/)
    assert.match(overlay, /t\('chat\.previousImage'\)/)
    assert.match(overlay, /t\('chat\.nextImage'\)/)
})

test('overlay installs and removes the shared lightbox keyboard handler', () => {
    assert.match(overlay, /onMounted\(\(\) => \{\s*window\.addEventListener\('keydown', handleLightboxKeydown\)\s*\}\)/)
    assert.match(overlay, /onBeforeUnmount\(\(\) => \{\s*window\.removeEventListener\('keydown', handleLightboxKeydown\)\s*\}\)/)
})

test('navigation labels exist in both locales', () => {
    assert.match(zh, /previousImage: '上一张'/)
    assert.match(zh, /nextImage: '下一张'/)
    assert.match(en, /previousImage: 'Previous image'/)
    assert.match(en, /nextImage: 'Next image'/)
})
```

- [ ] **Step 2: Run the overlay navigation test and verify RED**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test tests/media-preview-overlay-navigation.test.ts
```

Expected: 3 tests fail because the controls, lifecycle hooks, and labels do not exist.

- [ ] **Step 3: Add lifecycle wiring and consume navigation state**

In `src/components/chat/MediaPreviewOverlay.vue`, add the lifecycle import before the current imports:

```ts
import { onBeforeUnmount, onMounted } from 'vue'
```

Add these members to the `useMediaPreview()` destructuring:

```ts
    canNavigateLightbox,
    showPreviousImage,
    showNextImage,
    handleLightboxKeydown,
```

After the destructuring, register and clean up the listener:

```ts
onMounted(() => {
    window.addEventListener('keydown', handleLightboxKeydown)
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleLightboxKeydown)
})
```

- [ ] **Step 4: Add previous and next buttons**

Insert this block after the full-size image container and before `<!-- Tools -->`:

```vue
                <!-- Previous image -->
                <button v-if="canNavigateLightbox" @click.stop="showPreviousImage"
                    class="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md z-[60]"
                    :title="t('chat.previousImage')" :aria-label="t('chat.previousImage')">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                        stroke="currentColor" class="w-7 h-7">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                </button>

                <!-- Next image -->
                <button v-if="canNavigateLightbox" @click.stop="showNextImage"
                    class="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md z-[60]"
                    :title="t('chat.nextImage')" :aria-label="t('chat.nextImage')">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                        stroke="currentColor" class="w-7 h-7">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                </button>
```

- [ ] **Step 5: Add navigation labels to both locales**

In each locale's `chat` section, place the new keys after `copyImageFailed`.

`src/i18n/zh.ts`:

```ts
        previousImage: '上一张',
        nextImage: '下一张',
```

`src/i18n/en.ts`:

```ts
        previousImage: 'Previous image',
        nextImage: 'Next image',
```

- [ ] **Step 6: Run overlay and composable tests and verify GREEN**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test \
  tests/media-preview-navigation.test.ts \
  tests/media-preview-overlay-navigation.test.ts \
  tests/media-preview-overlay-mobile-double-tap.test.ts \
  tests/media-preview-overlay-copy-visibility.test.ts
```

Expected: 10 tests pass, 0 fail.

- [ ] **Step 7: Commit overlay navigation**

```bash
cd D:/Workspace/seedclaw
git add \
  src/components/chat/MediaPreviewOverlay.vue \
  src/i18n/zh.ts \
  src/i18n/en.ts \
  tests/media-preview-overlay-navigation.test.ts
git commit -m "feat(media): add lightbox navigation controls"
```

---

### Task 5: Add Native Mobile Image Sharing

**Files:**
- Modify: `src/composables/useMediaPreview.ts`
- Modify: `src/components/chat/MediaPreviewOverlay.vue`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`
- Create: `tests/media-preview-sharing.test.ts`
- Modify: `tests/media-preview-overlay-navigation.test.ts`

**Interfaces:**
- Consumes: current `lightboxSrc`, existing `getImageExtension()`, existing toast and i18n services, browser `fetch`, `File`, `navigator.canShare`, and `navigator.share`.
- Produces: `shareImage(src: string): Promise<void>` through `useMediaPreview()` and a mobile-only overlay share button.

- [ ] **Step 1: Write failing share behavior tests**

Create `tests/media-preview-sharing.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { useMediaPreview } from '../src/composables/useMediaPreview.ts'

const mediaPreview = useMediaPreview()
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalFetch = globalThis.fetch

const setNavigator = (value: Partial<Navigator>) => {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value,
    })
}

const restoreGlobals = () => {
    if (originalNavigator) {
        Object.defineProperty(globalThis, 'navigator', originalNavigator)
    } else {
        delete (globalThis as { navigator?: Navigator }).navigator
    }
    globalThis.fetch = originalFetch
}

test.afterEach(restoreGlobals)

test('shares the fetched image as a file when native file sharing is supported', async () => {
    const shareCalls: ShareData[] = []
    setNavigator({
        canShare: data => Boolean(data?.files?.length),
        share: async data => { shareCalls.push(data) },
    })
    globalThis.fetch = async () => ({
        ok: true,
        blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
    }) as Response

    await mediaPreview.shareImage('https://example.com/photo.jpg')

    assert.equal(shareCalls.length, 1)
    assert.equal(shareCalls[0].files?.length, 1)
    assert.equal(shareCalls[0].files?.[0].name.endsWith('.jpg'), true)
    assert.equal(shareCalls[0].files?.[0].type, 'image/jpeg')
})

test('falls back to sharing an HTTP image URL when file retrieval fails', async () => {
    const shareCalls: ShareData[] = []
    setNavigator({
        canShare: () => false,
        share: async data => { shareCalls.push(data) },
    })
    globalThis.fetch = async () => { throw new Error('network failure') }

    await mediaPreview.shareImage('https://example.com/photo.png')

    assert.deepEqual(shareCalls, [{ url: 'https://example.com/photo.png' }])
})

test('treats native share cancellation as final without URL fallback', async () => {
    const shareCalls: ShareData[] = []
    setNavigator({
        canShare: data => Boolean(data?.files?.length),
        share: async data => {
            shareCalls.push(data)
            const error = new Error('cancelled')
            error.name = 'AbortError'
            throw error
        },
    })
    globalThis.fetch = async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
    }) as Response

    await mediaPreview.shareImage('https://example.com/photo.png')

    assert.equal(shareCalls.length, 1)
    assert.equal(shareCalls[0].files?.length, 1)
})
```

Append this test to `tests/media-preview-overlay-navigation.test.ts`:

```ts
test('overlay shows native image sharing only on mobile', () => {
    assert.match(overlay, /v-if="isMobileDevice" @click\.stop="shareImage\(lightboxSrc\)"/)
    assert.match(overlay, /t\('chat\.shareImage'\)/)
    assert.match(zh, /shareImage: '分享图片'/)
    assert.match(zh, /shareImageFailed: '分享图片失败'/)
    assert.match(en, /shareImage: 'Share image'/)
    assert.match(en, /shareImageFailed: 'Failed to share image'/)
})
```

- [ ] **Step 2: Run the sharing tests and verify RED**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test \
  tests/media-preview-sharing.test.ts \
  tests/media-preview-overlay-navigation.test.ts
```

Expected: FAIL because `shareImage` and the mobile share control do not exist.

- [ ] **Step 3: Implement file-first sharing with URL fallback**

In `src/composables/useMediaPreview.ts`, add this function after `copyImageToClipboard` and before `convertToPng`:

```ts
const isShareCancelled = (error: unknown) =>
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError'

const shareImage = async (src: string) => {
    const toast = useToast()
    const { i18n } = await import('../i18n')
    const _t = (key: string) => i18n.global.t(key)

    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
        toast.error(_t('chat.shareImageFailed'))
        return
    }

    let fileShareError: unknown

    try {
        const response = await fetch(src)
        if (!response.ok) throw new Error(`Image request failed: ${response.status}`)

        const blob = await response.blob()
        const extension = getImageExtension(blob.type)
        const file = new File(
            [blob],
            ensureFileExtension(`image-${Date.now()}`, extension),
            { type: blob.type },
        )
        const shareData: ShareData = { files: [file] }

        if (navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData)
                return
            } catch (error) {
                if (isShareCancelled(error)) return
                fileShareError = error
            }
        }
    } catch (error) {
        fileShareError = error
    }

    if (/^https?:\/\//i.test(src)) {
        try {
            await navigator.share({ url: src })
            return
        } catch (error) {
            if (isShareCancelled(error)) return
            fileShareError = error
        }
    }

    console.error('Share image failed:', fileShareError)
    toast.error(_t('chat.shareImageFailed'))
}
```

Add `shareImage` to `_mediaPreviewState` after `copyImageToClipboard`.

- [ ] **Step 4: Add the mobile share control**

In `src/components/chat/MediaPreviewOverlay.vue`, add `shareImage` to the `useMediaPreview()` destructuring.

Inside the top-right tools group, place this button after the desktop copy button and before the download button:

```vue
                    <!-- Share -->
                    <button v-if="isMobileDevice" @click.stop="shareImage(lightboxSrc)"
                        class="btn btn-ghost btn-circle bg-white/10 text-white hover:bg-white/20 backdrop-blur-md"
                        :title="t('chat.shareImage')" :aria-label="t('chat.shareImage')">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2"
                            stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M7.217 10.907a2.25 2.25 0 100-1.814m0 1.814c.2-.118.415-.214.642-.285m-.642.285l6.566 3.772m0 0a2.25 2.25 0 103.935 2.188 2.25 2.25 0 00-3.935-2.188zm0-5.358a2.25 2.25 0 103.935-2.188 2.25 2.25 0 00-3.935 2.188zM7.86 9.378l5.923-3.401" />
                        </svg>
                    </button>
```

- [ ] **Step 5: Add sharing translations**

In each locale's `chat` section, add the strings after the navigation labels.

`src/i18n/zh.ts`:

```ts
        shareImage: '分享图片',
        shareImageFailed: '分享图片失败',
```

`src/i18n/en.ts`:

```ts
        shareImage: 'Share image',
        shareImageFailed: 'Failed to share image',
```

- [ ] **Step 6: Run sharing and overlay tests and verify GREEN**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test \
  tests/media-preview-sharing.test.ts \
  tests/media-preview-overlay-navigation.test.ts \
  tests/media-preview-overlay-copy-visibility.test.ts
```

Expected: 8 tests pass, 0 fail.

- [ ] **Step 7: Run type checking**

Run:

```bash
cd D:/Workspace/seedclaw
npm run tcs
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 8: Commit mobile sharing**

```bash
cd D:/Workspace/seedclaw
git add \
  src/composables/useMediaPreview.ts \
  src/components/chat/MediaPreviewOverlay.vue \
  src/i18n/zh.ts \
  src/i18n/en.ts \
  tests/media-preview-sharing.test.ts \
  tests/media-preview-overlay-navigation.test.ts
git commit -m "feat(media): share lightbox images on mobile"
```

---

### Task 6: Full Regression Verification

**Files:**
- Verify only; modify a feature file only if a failing test identifies a defect in the changes above.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-5.
- Produces: fresh evidence that media behavior, the complete test suite, and TypeScript checks pass together.

- [ ] **Step 1: Run all media preview and Markdown image tests**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test \
  tests/session-image-gallery.test.ts \
  tests/media-preview-navigation.test.ts \
  tests/media-preview-sharing.test.ts \
  tests/media-preview-session-gallery-wiring.test.ts \
  tests/media-preview-overlay-navigation.test.ts \
  tests/media-preview-overlay-mobile-double-tap.test.ts \
  tests/media-preview-overlay-copy-visibility.test.ts \
  tests/media-preview-tauri-download.test.ts \
  tests/markdown-image-preview.test.ts \
  tests/markdown-asset-urls.test.ts
```

Expected: all listed tests pass with 0 failures.

- [ ] **Step 2: Run the complete Node test suite**

Run:

```bash
cd D:/Workspace/seedclaw
node --experimental-strip-types --test tests/*.test.ts
```

Expected: all tests pass with 0 failures.

- [ ] **Step 3: Run the complete TypeScript check**

Run:

```bash
cd D:/Workspace/seedclaw
npm run tcs
```

Expected: exit 0 from both TypeScript commands.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```bash
cd D:/Workspace/seedclaw
git diff HEAD~5 --check
git status --short
git log -7 --oneline
```

Expected: `git diff --check` prints nothing; `git status --short` prints nothing; the log shows the design commit, the implementation-plan commit, and five focused implementation commits.

- [ ] **Step 5: Manually exercise the browser interactions**

Run:

```bash
cd D:/Workspace/seedclaw
npm run dev
```

In one session containing at least three images, verify this exact checklist:

1. Open the middle image; the lightbox starts on that image.
2. Click both side buttons; images change in message order.
3. Continue past each end; navigation wraps.
4. Press `ArrowLeft` and `ArrowRight`; behavior matches the buttons.
5. Zoom/pan one image, then navigate; the next image starts unzoomed and centered.
6. On mobile device emulation, confirm the share button is visible and the desktop copy button is hidden.
7. On a physical mobile browser or WebView, confirm the system share sheet receives the image file; when file sharing is unavailable for an HTTP(S) image, confirm URL sharing opens instead.
8. Close the lightbox and verify arrow keys no longer affect media preview state.
