import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const helperSource = readFileSync(path.join(root, 'src/utils/microphone-errors.ts'), 'utf8')
const chatInputSource = readFileSync(path.join(root, 'src/composables/useChatInput.ts'), 'utf8')
const voiceChatSource = readFileSync(path.join(root, 'src/composables/useVoiceChat.ts'), 'utf8')

test('microphone error helper normalizes mobile/browser media failures', () => {
  assert.match(helperSource, /NotFoundError/)
  assert.match(helperSource, /NotAllowedError/)
  assert.match(helperSource, /PermissionDeniedError/)
  assert.match(helperSource, /NotReadableError/)
  assert.match(helperSource, /AbortError/)
  assert.match(helperSource, /未找到可用的麦克风设备/)
  assert.match(helperSource, /麦克风权限未开启/)
})

test('chat input and voice chat use shared microphone error helper', () => {
  assert.match(chatInputSource, /getMicrophoneErrorMessage/)
  assert.match(voiceChatSource, /getMicrophoneErrorMessage/)
})
