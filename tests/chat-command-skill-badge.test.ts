import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const commandStatePath = path.resolve(testDir, '../src/composables/useCommandState.ts')
const chatInputPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')

const commandStateSource = readFileSync(commandStatePath, 'utf8')
const chatInputSource = readFileSync(chatInputPath, 'utf8')

test('command state accepts skill-sourced commands from /api/commands', () => {
    assert.match(
        commandStateSource,
        /'builtin' \| 'extension' \| 'prompt' \| 'skill'/,
        'CommandInfo.source should include the skill source',
    )
})

test('chat input renders a dedicated badge for skill commands', () => {
    // 徽章类名/文案集中在 script 的 SOURCE_BADGES 表，模板只消费——class 与 label 不会漂移
    assert.match(
        chatInputSource,
        /skill: \{ cls: 'badge-accent', label: '技能' \}/,
        'skill commands should get a dedicated badge-accent badge labeled 技能',
    )
    assert.match(
        chatInputSource,
        /const sourceBadge =/,
        'badge class/label should be resolved via the sourceBadge helper',
    )
    // 防回退：模板不得再保留三元链（历史上 class/label 两处平行三元，易漂移）
    assert.doesNotMatch(
        chatInputSource,
        /:class="cmd\.source === '/,
        'badge class should not be a template ternary chain',
    )
    assert.doesNotMatch(
        chatInputSource,
        /\{\{ cmd\.source === '/,
        'badge label should not be a template ternary chain',
    )
})
