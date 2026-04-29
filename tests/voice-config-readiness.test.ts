import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const settingsSource = readFileSync(path.join(root, 'src/stores/setting.ts'), 'utf8')
const chatInputVueSource = readFileSync(path.join(root, 'src/components/chat/ChatInput.vue'), 'utf8')
const chatHeaderSource = readFileSync(path.join(root, 'src/components/chat/ChatHeader.vue'), 'utf8')
const chatInputComposableSource = readFileSync(path.join(root, 'src/composables/useChatInput.ts'), 'utf8')
const voiceChatSource = readFileSync(path.join(root, 'src/composables/useVoiceChat.ts'), 'utf8')

test('settings store exposes engine-aware ASR/TTS readiness getters', () => {
  assert.match(settingsSource, /isCurrentAsrConfigured\(/)
  assert.match(settingsSource, /isCurrentTtsConfigured\(/)
  assert.match(settingsSource, /this\.currentAsrConfig\.baseUrl\.trim\(\)/)
  assert.match(settingsSource, /this\.currentTtsConfig\.baseUrl\.trim\(\)/)
})

test('chat mic and voice chat buttons use engine-aware readiness gating', () => {
  assert.match(chatInputVueSource, /settingsStore\.isCurrentAsrConfigured/)
  assert.match(chatHeaderSource, /settingsStore\.isCurrentAsrConfigured && settingsStore\.isCurrentTtsConfigured/)
})

test('failed mic startup releases audio control in both entry points', () => {
  assert.match(chatInputComposableSource, /releaseAudioControl\(stopRecording\)/)
  assert.match(voiceChatSource, /releaseAudioControl\(stopAudioOnly\)/)
})
