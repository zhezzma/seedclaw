# Markdown Relative URL Resolution Design

## Goal

Ensure relative URLs rendered by `MarkdownRenderer` point to the configured API service, regardless of whether Markdown emits an image `src` or link `href`.

## Scope

The behavior applies to every `MarkdownRenderer` consumer, including chat messages, A2UI text, and workspace Markdown previews. In this application, relative URLs rendered through this component are treated as API-relative resources; workspace document-relative navigation is not preserved.

The change only resolves URLs. It does not change Markdown semantics: `[text](url)` remains a text link, while `![alt](url)` remains an embedded image.

## URL Rules

Use one resolver for Markdown image sources and link destinations.

Leave these values unchanged:

- Absolute URLs with a URI scheme, including `http:`, `https:`, `mailto:`, `tel:`, `data:`, and `blob:`.
- Fragment-only references beginning with `#`.
- Protocol-relative URLs beginning with `//`.
- Empty or missing values.

Resolve all other values against the configured `apiBaseUrl`, including root-relative paths such as `/assets/image.png` and relative paths such as `./image.png`, `../image.png`, and `images/image.png`.

If `apiBaseUrl` is empty, leave the original URL unchanged.

## Implementation Boundary

Extend the existing post-render media URL transformation in `src/utils/media-url.ts` so it rewrites both `<img src>` and `<a href>` attributes. `MarkdownRenderer` continues to call the transformation before inserting HTML into the DOM.

Do not modify markdown-it configuration, Web Worker message contracts, image preview behavior, or download behavior.

Rename the image-specific transformation if needed so its name reflects that it handles Markdown resource URLs rather than only images.

## Verification

Automated tests must cover:

- Relative image `src` values resolved against `apiBaseUrl`.
- Relative link `href` values resolved against `apiBaseUrl`.
- Root-relative, dot-relative, parent-relative, and plain relative paths.
- Absolute URI schemes, fragment references, and protocol-relative URLs left unchanged.
- Relative URLs left unchanged when `apiBaseUrl` is empty.
- Existing Markdown image preview integration still uses the transformed HTML.

The project type check and focused Markdown URL tests must pass.
