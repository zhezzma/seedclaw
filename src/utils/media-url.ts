/** Resolve media references returned by the backend against the configured API origin. */
export function resolveMediaUrl(url: string | undefined, apiBaseUrl: string): string | undefined {
  if (!url || /^(?:https?:|data:|blob:)/i.test(url)) return url

  const baseUrl = apiBaseUrl.trim().replace(/\/+$/, '')
  if (!baseUrl) return url

  return `${baseUrl}/${url.replace(/^\/+/, '')}`
}

/** Apply the shared media URL policy to image sources emitted by MarkdownIt. */
export function resolveMarkdownImageUrls(html: string, apiBaseUrl: string): string {
  if (!apiBaseUrl.trim() || !html.includes('<img')) return html

  return html.replace(
    /(<img\b[^>]*\bsrc=)(["'])([^"']*)\2/gi,
    (_match, prefix: string, quote: string, url: string) =>
      `${prefix}${quote}${resolveMediaUrl(url, apiBaseUrl) ?? ''}${quote}`,
  )
}
