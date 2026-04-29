import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const audioManagerSource = readFileSync(path.join(root, 'src/utils/audioManager.ts'), 'utf8')
const voiceChatSource = readFileSync(path.join(root, 'src/composables/useVoiceChat.ts'), 'utf8')

test('audio manager does not self-stop when the same source re-acquires control', () => {
  assert.match(audioManagerSource, /if \(activeSourceId === sourceId && currentStopCallback === stopFn\) \{\s*return\s*\}/)
})

test('voice chat does not take audio output control while only starting microphone listening', () => {
  const startBlockMatch = voiceChatSource.match(/const start = async \(\) => \{[\s\S]*?\n    \}/)
  assert.ok(startBlockMatch, 'expected to find start() block')
  assert.doesNotMatch(startBlockMatch[0], /takeAudioControl\('VoiceChat', stopAudioOnly\)/)
  assert.match(voiceChatSource, /takeAudioControl\('VoiceChat', stopAudioOnly\)/)
})

test('voice chat releases audio control when playback start fails', () => {
  assert.match(voiceChatSource, /catch \(e\) \{[\s\S]*releaseAudioControl\(stopAudioOnly\)/)
})

test('voice chat releases audio control when queued playback drains after errors', () => {
  assert.match(voiceChatSource, /if \(playbackQueue\.length === 0\) \{\s*releaseAudioControl\(stopAudioOnly\)/)
  assert.match(voiceChatSource, /if \(segment\.status === 'error'\) \{[\s\S]*if \(playbackQueue\.length === 0\) \{[\s\S]*releaseAudioControl\(stopAudioOnly\)/)
})

test('voice chat clears retry timers before replacing pending segments during finishStream merge', () => {
  assert.match(voiceChatSource, /pendingItems\.forEach\(segment => \{[\s\S]*clearSegmentRetry\(segment\)[\s\S]*revokeSegmentAudioUrl\(segment\)/)
})

test('voice chat cleans up queued playback resources before starting a new stream turn', () => {
  assert.match(voiceChatSource, /const startStream = \(\) => \{[\s\S]*cleanupQueuedPlaybackSegments\(\)[\s\S]*textBuffer = ''/)
  assert.doesNotMatch(voiceChatSource, /const startStream = \(\) => \{[\s\S]*playbackQueue = \[\]/)
})
