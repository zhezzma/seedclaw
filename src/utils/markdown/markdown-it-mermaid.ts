import MarkdownIt from 'markdown-it'
import { mermaidCache, mermaidState } from './mermaid-cache'

/** Simple string hash function for deterministic IDs */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Markdown-it的Mermaid插件，用于在Vue环境中处理mermaid代码块
 */
export default function markdownItMermaid(md: MarkdownIt): void {
  // 保存原始的fence渲染函数
  const originalFence = md.renderer.rules.fence || ((tokens, idx, options, _env, self) => {
    return self.renderToken(tokens, idx, options)
  })

  // 替换fence渲染函数，识别并处理mermaid代码块
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const code = token.content.trim()
    const info = token.info.trim()

    // 检查是否为mermaid代码块
    if (info === 'mermaid') {
      // 检查代码块是否正常闭合 (判断原始Markdown以避免在流式输出过程中提前渲染并闪烁)
      if (env && typeof env.source === 'string' && token.map) {
        const lines = env.source.split('\n');
        const endLineIdx = token.map[1] - 1;
        if (endLineIdx >= 0 && endLineIdx < lines.length) {
          const lastLine = lines[endLineIdx].trim();
          // 如果代码块的最后一行不是对应的闭合标记 (如 ```) => 尚未闭合，此时降级为普通代码块渲染
          if (!lastLine.startsWith(token.markup)) {
            return originalFence(tokens, idx, options, env, self);
          }
        }
      }

      // 生成确定性的唯一ID（避免流式输出或worker重复渲染时ID随机导致Vue DOM刷新闪烁）
      const diagramId = `mermaid-${idx}-${hashCode(code)}`

      // 尝试从缓存中获取已经渲染好的SVG，避免最后阶段出现 placeholder 闪烁
      const cacheKey = `${mermaidState.isDark ? 'dark' : 'light'}:${code}`;
      let cachedSvg = `<div class="mermaid-loading">图表加载中...</div>`;
      if (mermaidCache.has(cacheKey)) {
        cachedSvg = mermaidCache.get(cacheKey) || cachedSvg;
      }

      // 创建特殊元素，包含所需的数据属性和交互控件
      return `<div class="mermaid-diagram-wrapper">
        <div class="mermaid-controls">
          <button type="button" class="mermaid-zoom-in" title="放大">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2z"/></svg>
          </button>
          <button type="button" class="mermaid-zoom-out" title="缩小">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>
          </button>
          <button type="button" class="mermaid-reset" title="重置">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </button>
          <button type="button" class="mermaid-download" title="下载SVG">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </button>
          <button type="button" class="mermaid-copy" title="复制图表代码">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button type="button" class="mermaid-toggle-code" title="查看代码">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
          </button>
        </div>
        <div class="mermaid-diagram-container" data-scale="1">
          <div class="mermaid-diagram" id="${diagramId}" data-mermaid="${encodeURIComponent(code)}" data-original-code="${encodeURIComponent(code)}">
            ${cachedSvg}</div>
        </div>
        <div class="mermaid-code-container" style="display: none;">
          <pre><code class="language-mermaid">${md.utils.escapeHtml(code)}</code></pre>
        </div>
      </div>`
    }

    // 非mermaid代码块使用原始渲染函数
    return originalFence(tokens, idx, options, env, self)
  }
}
