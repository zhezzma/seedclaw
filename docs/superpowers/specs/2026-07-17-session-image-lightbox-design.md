# Session Image Lightbox Navigation and Mobile Sharing Design

**Date:** 2026-07-17
**Status:** Approved

## Goal

Enhance the shared image lightbox so a user can navigate all images in the currently loaded chat session with visible previous/next buttons or the keyboard arrow keys. On mobile devices, add a native share action for the currently displayed image.

## Scope

The session gallery contains images from the current session's loaded, processed messages in display order:

- structured image blocks in user and assistant messages;
- images rendered from normal Markdown text blocks;
- images rendered from thinking blocks.

The gallery does not contain attachments that are still in the chat input and have not been sent. Other images in the application, such as avatars and icons, are also excluded.

Repeated URLs are de-duplicated while preserving their first occurrence. Navigation wraps from the first image to the last and from the last image to the first.

## Architecture

### Session image collection

Add a focused, pure utility that derives image URLs from `DisplayMessage[]`:

1. Walk messages and blocks in display order.
2. Resolve structured image sources with the same URL and data-URI rules used by the message renderer.
3. Parse Markdown using the existing Markdown configuration and collect image destinations from the image tokens that configuration renders.
4. Resolve relative image destinations with the existing media URL policy.
5. Remove empty values and duplicate URLs while preserving order.

`HomeView` computes this gallery from `processedMessages` and the current API base URL, then synchronizes it to the shared media preview state. This data-driven approach is required because `VirtualMessageList` unmounts off-screen rows; component registration or DOM scanning would omit images outside the current render window.

### Shared lightbox state

Extend `useMediaPreview.ts` with:

- the current session image source list;
- the current image index;
- a setter for the session image source list;
- previous/next navigation methods;
- a lightbox keyboard handler;
- a mobile image sharing action.

When `openLightbox(src)` receives a source present in the current session list, it selects that index. If the source is not in the list, it opens as an isolated single-image preview. This preserves the existing behavior for unsent input attachments and other non-session callers.

Changing images always resets zoom, translation, and dragging state. Navigation is enabled only when the active gallery contains at least two images. Previous/next navigation uses modulo arithmetic to wrap at both ends.

Closing the lightbox clears the active source and index but retains the current session source list for the next open.

### Overlay interaction

`MediaPreviewOverlay.vue` adds:

- a previous button fixed at the vertical center on the left;
- a next button fixed at the vertical center on the right;
- a mobile-only share button in the existing top-right tool group.

The navigation buttons are shown only when the active gallery has at least two images. They use the same composable methods as keyboard navigation.

The overlay registers one window `keydown` listener while mounted. The handler acts only while the lightbox is open:

- `ArrowLeft` selects the previous image;
- `ArrowRight` selects the next image;
- handled arrow events call `preventDefault()`.

The listener is removed when the overlay unmounts.

## Mobile sharing

The share button is shown under the existing mobile user-agent condition. Sharing follows this sequence:

1. Fetch the active image and construct a `File` with a MIME-appropriate extension.
2. If the Web Share API reports that file sharing is supported, call `navigator.share({ files: [file] })`.
3. If file retrieval or file sharing is unavailable, and the source is an HTTP(S) URL, call `navigator.share({ url: src })` as a fallback.
4. If the Web Share API is unavailable, or a data/blob source cannot be shared as a file, display a localized failure toast.
5. Treat `AbortError` as user cancellation and do not display an error.

No additional progress modal or share state is introduced.

## Error Handling

- Empty or single-image galleries make navigation a no-op.
- Opening a source outside the session gallery creates an isolated active gallery instead of navigating unrelated session images.
- Image switching resets zoom to avoid carrying a transformed viewport to a different image.
- Share failures are caught and reported through the existing toast/i18n mechanisms.
- User cancellation of the native share sheet is silent.

## Internationalization

Add Chinese and English strings for:

- previous image;
- next image;
- share image;
- share failure.

These strings are used for button titles/accessible labels and failure feedback.

## Testing

Implementation follows red-green-refactor.

1. **Session gallery utility tests**
   - preserves message/block image order;
   - includes structured and Markdown/thinking images;
   - resolves relative URLs with the configured API base URL;
   - de-duplicates repeated URLs;
   - excludes non-image blocks.
2. **Composable behavior tests**
   - opens at the matching session index;
   - wraps previous/next navigation;
   - ignores navigation for isolated single images;
   - handles `ArrowLeft` and `ArrowRight` only while open;
   - resets zoom and translation after switching.
3. **Overlay contract tests**
   - contains previous and next controls wired to the composable;
   - registers and removes the keyboard listener;
   - shows the share control only on mobile;
   - uses localized labels.
4. **Verification**
   - run focused new and existing media preview tests;
   - run the full Node test suite;
   - run the project's TypeScript check.

## Non-Goals

- Swipe gestures for changing images.
- A thumbnail strip, image counter, captions, or preloading.
- Sharing on desktop.
- Including unsent chat input attachments in the session gallery.
- Refactoring unrelated media download, clipboard, or rendering code.
