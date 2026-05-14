import test from 'node:test'
import assert from 'node:assert/strict'

import markdownItCodeTitle from '../src/utils/markdown/markdown-it-code-title.ts'

test('code copy payload strips a leading ZWNBSP/BOM from clipboard text', () => {
  const md = {
    renderer: {
      rules: {
        code_block: (tokens: Array<{ content: string }>, idx: number) => `<pre>${tokens[idx].content}</pre>`,
        fence: (tokens: Array<{ content: string }>, idx: number) => `<pre>${tokens[idx].content}</pre>`
      }
    }
  }

  markdownItCodeTitle(md, { svg: '' })

  const token = {
    info: 'ts',
    content: '\uFEFFconsole.log("hello")\n'
  }

  const html = md.renderer.rules.fence([token], 0)

  assert.doesNotMatch(html, /data-clipboard-text="\uFEFF/)
  assert.match(html, /data-clipboard-text="console\.log\(&quot;hello&quot;\)\n"/)
  assert.match(html, /<pre>\uFEFFconsole\.log\("hello"\)\n<\/pre>/)
})
