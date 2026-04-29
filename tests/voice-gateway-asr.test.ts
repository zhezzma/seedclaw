import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const asrSource = readFileSync(path.join(root, 'src/utils/asr/voice-gateway.ts'), 'utf8')
const speechRecognitionSource = readFileSync(path.join(root, 'src/utils/asr/speechRecognition.ts'), 'utf8')

const buildVoiceGatewaySttUrl = (baseUrl: string, token: string) => {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const normalizedBaseUrl = trimmedBaseUrl
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://')

  return `${normalizedBaseUrl}/ws/stt?provider=workers-ai&token=${encodeURIComponent(token)}`
}

const resolveVoiceGatewayAsrToken = (token: string) => token.trim()
const resolveEngineType = (engineType: string | null | undefined) => engineType === 'voice-gateway' ? 'voice-gateway' : 'fun-asr'

test('buildVoiceGatewaySttUrl converts https base URLs to secure websocket URLs', () => {
  const url = buildVoiceGatewaySttUrl('https://voice.godgodgame.com', 'token-123')

  assert.equal(
    url,
    'wss://voice.godgodgame.com/ws/stt?provider=workers-ai&token=token-123',
  )
})

test('buildVoiceGatewaySttUrl keeps custom paths normalized to /ws/stt', () => {
  const url = buildVoiceGatewaySttUrl('http://voice.example.com/base/', 'token-xyz')

  assert.equal(
    url,
    'ws://voice.example.com/base/ws/stt?provider=workers-ai&token=token-xyz',
  )
})

test('resolveVoiceGatewayAsrToken returns the trimmed engine token', () => {
  assert.equal(resolveVoiceGatewayAsrToken(' asr-token '), 'asr-token')
  assert.equal(resolveVoiceGatewayAsrToken(''), '')
})

test('voice gateway ASR source exposes the agreed default STT model', () => {
  assert.match(asrSource, /DEFAULT_VOICE_GATEWAY_ASR_MODEL = '@cf\/openai\/whisper-large-v3-turbo'/)
})

test('resolveEngineType keeps explicit voice-gateway selection', () => {
  assert.equal(resolveEngineType('voice-gateway'), 'voice-gateway')
})

test('resolveEngineType defaults missing values to fun-asr', () => {
  assert.equal(resolveEngineType(undefined), 'fun-asr')
  assert.equal(resolveEngineType(null), 'fun-asr')
  assert.equal(resolveEngineType(''), 'fun-asr')
})

test('resolveEngineType falls back unknown engines to fun-asr', () => {
  assert.equal(resolveEngineType('other-engine'), 'fun-asr')
})

test('speech recognition source includes explicit voice-gateway engine resolution', () => {
  assert.match(speechRecognitionSource, /if \(engineType === 'voice-gateway'\)/)
})

test('voice gateway asr source aligns with ready being optional and uses session shutdown frame', () => {
  assert.match(asrSource, /await this\.attachListener\(\)/)
  assert.match(asrSource, /await this\.sendConfig\(config\.model\)/)
  assert.doesNotMatch(asrSource, /readyTimeoutId/)
  assert.doesNotMatch(asrSource, /readyResolver/)
  assert.doesNotMatch(asrSource, /readyRejecter/)
  assert.match(asrSource, /if \(messageType === 'ready'\) \{[\s\S]*this\.state = 'ready'/)
  assert.match(asrSource, /type:\s*'audio_end'/)
})

test('voice gateway asr captures startup config for later stop instead of re-reading mutable store state', () => {
  assert.doesNotMatch(asrSource, /const \{ language \} = this\.getConfig\(\)/)
})

test('voice gateway asr source does not log websocket URLs or raw transcript payloads', () => {
  assert.doesNotMatch(asrSource, /console\.info\('\[VoiceGatewayASR\] connecting', \{ wsUrl/)
  assert.doesNotMatch(asrSource, /console\.info\('\[VoiceGatewayASR\] recv raw'/)
  assert.doesNotMatch(asrSource, /console\.info\('\[VoiceGatewayASR\] recv text', \{ messageType, message \}\)/)
  assert.doesNotMatch(asrSource, /console\.info\('\[VoiceGatewayASR\] extracted text'/)
  assert.doesNotMatch(asrSource, /console\.error\('\[VoiceGatewayASR\] error message', message\)/)
})
