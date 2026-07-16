/** Resolve media references returned by the backend against the configured API origin. */
export function resolveMediaUrl(url: string | undefined, apiBaseUrl: string): string | undefined {
  if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('//')) return url

  const baseUrl = apiBaseUrl.trim().replace(/\/+$/, '')
  if (!baseUrl) return url

  return `${baseUrl}/${url.replace(/^\/+/, '')}`
}

/** Apply the shared media URL policy to image sources and links emitted by MarkdownIt. */
export function resolveMarkdownResourceUrls(html: string, apiBaseUrl: string): string {
  if (!apiBaseUrl.trim() || (!html.includes('<img') && !html.includes('<a'))) return html

  return html.replace(/<(img|a)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag: string, tagName: string) => {
    const resourceAttribute = tagName.toLowerCase() === 'img' ? 'src' : 'href'

    return tag.replace(
      /(\s+)([^\s=/>]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/g,
      (attribute: string, whitespace: string, name: string, equals: string, doubleValue?: string, singleValue?: string) => {
        if (name.toLowerCase() !== resourceAttribute) return attribute

        const quote = doubleValue === undefined ? "'" : '"'
        const url = doubleValue ?? singleValue ?? ''
        return `${whitespace}${name}${equals}${quote}${resolveMediaUrl(url, apiBaseUrl) ?? ''}${quote}`
      },
    )
  })
}
