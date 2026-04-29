import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const ttsSource = readFileSync(path.join(root, 'src/composables/useTTS.ts'), 'utf8')

test('tts releases audio control after natural playback completion', () => {
  assert.match(ttsSource, /if \(currentReadingMsgId\.value === msgId\) \{[\s\S]*currentReadingMsgId\.value = null[\s\S]*releaseAudioControl\(stopPlayback\)/)
})
