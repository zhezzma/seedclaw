import MarkdownIt from 'markdown-it'
import mila from 'markdown-it-link-attributes'
import mk from "@vscode/markdown-it-katex";
import mdhljs from 'markdown-it-highlightjs'
import mdct from './markdown-it-code-title.ts'
import hljs from './hljs.ts'
import markdownItMermaid from "./markdown-it-mermaid.ts"



export interface MarkdownConfigOptions {
    onCopySuccess?: (text: string, element: HTMLElement) => void
    onFullscreen?: (text: string, element: HTMLElement) => void
}

export function createMarkdownItInstance(options: MarkdownConfigOptions = {}): MarkdownIt {
    const md = new MarkdownIt({
        linkify: true,
        breaks: true,
    }).disable('code') // disable('code')告诉 markdown-it 实例，让它忽略"缩进代码块"的解析规则。

    md.use(mdct, {
        headerClass: "code-header-bg",
        svg: `<svg fill="none" viewBox="0 0 24 24" width="1em" height="1em" class="t-icon t-icon-copy" slot="icon"><path fill="currentColor" d="M2 2h13v5.5h-2V4H4v9h3.5v2H2V2zm7 7h13v13H9V9zm2 2v9h9v-9h-9z"></path></svg>`,
        onCopySuccess: options.onCopySuccess || (() => { }),
        onCopyError: () => { },
        onFullscreen: options.onFullscreen || (() => { })
    })
    md.use(mdhljs, { hljs })
    md.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
    md.use(mk, { throwOnError: false, errorColor: " #cc0000", enableBareBlocks: true, enableMathBlockInHtml: false, enableMathInlineInHtml: false, enableFencedBlocks: true });
    md.use(markdownItMermaid)

    return md
}