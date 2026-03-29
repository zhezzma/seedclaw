import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')
const source = readFileSync(componentPath, 'utf8')

const thinkingSectionStart = '<!-- Thinking Level -->'
const thinkingSectionEnd = '</div>\n\n                </div>'
const start = source.indexOf(thinkingSectionStart)
const end = source.indexOf(thinkingSectionEnd, start)

assert.notEqual(start, -1, 'missing thinking dropdown section start marker')
assert.notEqual(end, -1, 'missing thinking dropdown section end marker')

const thinkingSection = source.slice(start, end)

test('thinking dropdown marks the current value with daisyUI menu-active class', () => {
    assert.match(
        thinkingSection,
        /:class="\{\s*'menu-active'\s*:\s*thinkingLevel\s*===\s*level\s*\}"/,
        'thinking dropdown should use daisyUI menu-active class for the selected thinking level',
    )
})

test('thinking dropdown uses a narrower width class', () => {
    assert.match(
        thinkingSection,
        /class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-36 border border-base-300 mb-2 z-\[100\]"/,
        'thinking dropdown should shrink from the previous w-40 width to w-36',
    )
})
