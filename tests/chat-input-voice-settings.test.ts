import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const chatInputSource = readFileSync(path.join(root, 'src/composables/useChatInput.ts'), 'utf8')
const chatInputVueSource = readFileSync(path.join(root, 'src/components/chat/ChatInput.vue'), 'utf8')

test('chat input microphone gating uses normalized ASR readiness getters', () => {
  assert.match(chatInputSource, /if \(!settingsStore\.isCurrentAsrConfigured\)/)
  assert.doesNotMatch(chatInputSource, /settingsStore\.asrToken/)
  assert.doesNotMatch(chatInputSource, /settingsStore\.asrModel/)
  assert.match(chatInputSource, /请先在设置中完整配置语音识别/)
})

test('chat input microphone visibility follows current ASR readiness', () => {
  assert.match(chatInputVueSource, /settingsStore\.isCurrentAsrConfigured/)
})
