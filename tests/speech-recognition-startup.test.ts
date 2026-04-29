import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = readFileSync(path.join(root, 'src/utils/asr/speechRecognition.ts'), 'utf8')
const chatInputSource = readFileSync(path.join(root, 'src/composables/useChatInput.ts'), 'utf8')
const microphoneErrorsSource = readFileSync(path.join(root, 'src/utils/microphone-errors.ts'), 'utf8')

test('legacy speech recognition startup initializes microphone before connecting ASR engine', () => {
  assert.match(source, /await this\.audioProcessor\.start\(/)
  assert.match(source, /await this\.audioProcessor\.start\([\s\S]*this\.currentEngine = this\.createEngine\(store\.asrEngine\)[\s\S]*await this\.currentEngine\.start\(onResult\)/)
})

test('chat input delegates microphone errors to the shared error helper', () => {
  assert.match(chatInputSource, /getMicrophoneErrorMessage\(error\)/)
  assert.match(microphoneErrorsSource, /NotFoundError/)
  assert.match(microphoneErrorsSource, /Requested device not found/)
  assert.match(microphoneErrorsSource, /未找到可用的麦克风设备/)
})
