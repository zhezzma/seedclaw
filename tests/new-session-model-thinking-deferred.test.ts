import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const chatInputPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')
const homeViewPath = path.resolve(testDir, '../src/views/HomeView.vue')
const chatStatePath = path.resolve(testDir, '../src/composables/useChatState.ts')

const chatInputSource = readFileSync(chatInputPath, 'utf8')
const homeViewSource = readFileSync(homeViewPath, 'utf8')
const chatStateSource = readFileSync(chatStatePath, 'utf8')

test('new-session model/thinking selection only records local pending state without sending', () => {
    const pendingModeMatch = chatInputSource.match(
        /const isPendingMode = computed\(\(\) => isNewSession\(route\)\)/,
    )
    assert.ok(pendingModeMatch, 'ChatInput should derive pending mode from the new-session route')

    const pendingModelGuard = /if \(isPendingMode\.value\) \{\s*pendingModel\.value = modelId\s*return\s*\}/.test(
        chatInputSource,
    )
    assert.ok(
        pendingModelGuard,
        'model selection on a new session should only update pendingModel and never call onSend',
    )

    const pendingThinkingGuard =
        /if \(isPendingMode\.value\) \{\s*pendingThinkingLevel\.value = level\s*return\s*\}/.test(chatInputSource)
    assert.ok(
        pendingThinkingGuard,
        'thinking selection on a new session should only update pendingThinkingLevel and never call onSend',
    )
})

test('pending overrides are consumed once and submitted with the first message', () => {
    assert.match(
        chatInputSource,
        /const consumePendingOverrides = \(\): ChatSendOverrides =>/,
        'ChatInput should expose consumePendingOverrides returning ChatSendOverrides',
    )

    assert.match(
        homeViewSource,
        /chatOverrides = chatInputRef\.value\?\.consumePendingOverrides\(\)/,
        'HomeView should consume the pending overrides when committing the first message',
    )

    assert.match(
        homeViewSource,
        /chatState\.sendMessage\(inputText, \[\.\.\.imageAttachments\], targetSessionKey, chatOverrides\)/,
        'HomeView should pass the pending overrides into chatState.sendMessage',
    )
})

test('sendMessage forwards provider/model/thinkingLevel overrides to the server request body', () => {
    assert.match(
        chatStateSource,
        /const split = splitModelId\(overrides\.model\)/,
        'sendMessage should split the pending provider/model via splitModelId',
    )

    assert.match(
        chatStateSource,
        /body\.provider = split\.provider[\s\S]*?body\.model = split\.model/,
        'sendMessage should forward the split provider/model in the request body',
    )

    assert.match(
        chatStateSource,
        /body\.thinkingLevel = overrides\.thinkingLevel/,
        'sendMessage should forward the pending thinking level in the request body',
    )
})

test('local session cache patch only includes provided override keys', () => {
    // updateSessionLocal 是 Object.assign 合并：undefined 键会覆盖服务端返回的默认值，
    // 且 thinkingLevel 回填不能耦合在 model 分支里（只选思考级别时也要写本地缓存）
    assert.match(
        homeViewSource,
        /const overridePatch: Partial<SessionRow> = \{\}/,
        'HomeView should build a partial patch for the created session row',
    )

    assert.match(
        homeViewSource,
        /if \(chatOverrides\?\.thinkingLevel\) \{\s*overridePatch\.thinkingLevel = chatOverrides\.thinkingLevel\s*\}/,
        'the thinking override should be written to the local cache independently of the model override',
    )

    assert.doesNotMatch(
        homeViewSource,
        /thinkingLevel: chatOverrides\.thinkingLevel/,
        'an undefined thinkingLevel must never be assigned over the server-provided session row',
    )
})
