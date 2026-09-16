import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import markdownItCodeTitle from '../src/utils/markdown/markdown-it-code-title.ts'

/**
 * Markdown 渲染 XSS 回归测试（代码审核 #1）。
 *
 * 背景：markdown-it-code-title 曾把 fence 原文（svg 围栏 / html-xml 预览）
 * 未转义拼进 HTML 再走 v-html，AI 输出一条恶意 fence 即可零交互执行脚本。
 * 修复方式：所有插值点 escapeHtml，预览改 sandbox iframe（不含 allow-scripts）。
 * mermaid-render 的错误路径同理。
 */
const testDir = path.dirname(fileURLToPath(import.meta.url))

/** 模拟真实 markdown-it fence 行为：正文经高亮器输出时已转义 */
const makeMd = () => ({
    renderer: {
        rules: {
            code_block: (tokens: Array<{ content: string }>, idx: number) =>
                `<pre>${tokens[idx].content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
            fence: (tokens: Array<{ content: string }>, idx: number) =>
                `<pre>${tokens[idx].content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
        },
    },
})

/** data-clipboard-text 是复制载荷（引号转义后存放原文属设计内行为），
 *  剥掉后再断言其余文档无任何未转义 HTML */
const stripClipboardAttrs = (html: string) => html.replace(/data-clipboard-text="[^"]*"/g, '')

test('svg fence renders into sandbox iframe srcdoc; raw markup never enters the document', () => {
    const md = makeMd()
    markdownItCodeTitle(md, { svg: '' })

    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    const html = md.renderer.rules.fence([{ info: 'svg', content: payload + '\n' }], 0)

    // 预览走 sandbox iframe，不含 allow-scripts（内嵌脚本/事件处理器一律不执行）
    assert.match(html, /<iframe class="code-preview-frame" sandbox="allow-same-origin"/)
    assert.match(html, /srcdoc="[^"]*&lt;img src=x/)

    // 除 clipboard 属性外，原文不得以未转义形式出现在主文档
    const outsideClipboard = stripClipboardAttrs(html)
    assert.doesNotMatch(outsideClipboard, /<img|<script/)
})

test('html fence preview is lazy (data-srcdoc) and sandboxed', () => {
    const md = makeMd()
    markdownItCodeTitle(md, { svg: '' })

    const html = md.renderer.rules.fence([{ info: 'html', content: '<b onclick=alert(1)>x</b>\n' }], 0)

    assert.match(html, /data-srcdoc="[^"]*&lt;b onclick=alert\(1\)&gt;/)
    assert.match(html, /sandbox="allow-same-origin"/)
    assert.doesNotMatch(stripClipboardAttrs(html), /<b onclick/)
})

test('renderer emits no inline event handler attributes (delegation-only wiring)', () => {
    const md = makeMd()
    markdownItCodeTitle(md, { svg: '' })

    const html = md.renderer.rules.fence([{ info: 'svg', content: 'x\n' }], 0)

    // 交互全部走 document 级事件委托，模板不产出 onclick=/onload=
    // （当前 csp 为 null 时内联属性也能用，但保持委托：CSP-ready 且避免逐节点绑事件；
    // 一旦有人把内联属性加回模板，这里立刻红）
    assert.doesNotMatch(html, /\son(?:load|click)=/i)
})

test('code language is escaped before interpolation', () => {
    const md = makeMd()
    markdownItCodeTitle(md, { svg: '' })

    const html = md.renderer.rules.fence(
        [{ info: 'svg"><img src=x onerror=alert(1)>', content: 'x\n' }],
        0
    )

    assert.doesNotMatch(stripClipboardAttrs(html), /<img/)
    assert.match(html, /<span class="code-language">[^<]*&lt;img/)
})

test('preview toggle no longer assigns innerHTML (source assertion)', () => {
    const source = readFileSync(
        path.resolve(testDir, '../src/utils/markdown/markdown-it-code-title.ts'),
        'utf8'
    )
    assert.ok(!source.includes('previewContent.innerHTML'),
        'toggleCodePreview must not assign innerHTML from clipboard payload')
})

test('mermaid error path escapes code and message; securityLevel is strict (source assertion)', () => {
    const source = readFileSync(
        path.resolve(testDir, '../src/utils/markdown/mermaid-render.ts'),
        'utf8'
    )
    assert.match(source, /escapeHtml\(originalCode\)/)
    assert.match(source, /escapeHtml\(errorMessage\)/)
    assert.match(source, /securityLevel: 'strict'/)
    assert.ok(!source.includes("securityLevel: 'loose'"),
        'loose 放大攻击面且应用侧从未注册 mermaid click 回调，不得回退')
})
