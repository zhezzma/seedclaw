import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const viewHeaderPath = path.resolve(testDir, '../src/components/ViewHeader.vue')
const chatHeaderPath = path.resolve(testDir, '../src/components/chat/ChatHeader.vue')

const viewHeaderSource = readFileSync(viewHeaderPath, 'utf8')
const chatHeaderSource = readFileSync(chatHeaderPath, 'utf8')

test('ViewHeader supports hiding the bottom border via showBorder (default true)', () => {
    assert.match(
        viewHeaderSource,
        /showBorder\?: boolean/,
        'ViewHeader should declare an optional showBorder prop',
    )

    assert.match(
        viewHeaderSource,
        /showBorder: true/,
        'showBorder should default to true so existing usages keep the border',
    )

    assert.match(
        viewHeaderSource,
        /'border-b border-base-300': showBorder/,
        'the border classes should be gated behind the showBorder prop',
    )
})

test('ChatHeader hides the border on the new-session page and shows it in a session', () => {
    assert.match(
        chatHeaderSource,
        // 后随属性（如 wc-pad 预留悬浮窗口键宽度）不影响 showBorder 绑定语义
        /<ViewHeader\s+:show-border="isSession"(?:\s[^>]*)?>/,
        'ChatHeader should bind showBorder to isSession (hidden on the new-session page)',
    )
})
