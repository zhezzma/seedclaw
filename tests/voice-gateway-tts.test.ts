import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = readFileSync(path.join(root, 'src/utils/tts/voice-gateway.ts'), 'utf8')

const DEFAULT_VOICE_GATEWAY_TTS_MODEL = 'gemini-3.1-flash-tts-preview'
const DEFAULT_VOICE_GATEWAY_TTS_VOICE = 'Aoede'

const buildVoiceGatewayTtsUrl = (baseUrl: string, token: string) => {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const normalizedBaseUrl = trimmedBaseUrl
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://')

  return `${normalizedBaseUrl}/ws/tts?provider=gemini&token=${encodeURIComponent(token)}`
}

const resolveVoiceGatewayTtsToken = (token: string) => token.trim()

const pcm16ToWav = (pcm: Uint8Array, sampleRate: number, channels: number, bitsPerSample: number) => {
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = pcm.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const wav = new Uint8Array(buffer)
  wav.set(pcm, 44)
  return wav
}

test('buildVoiceGatewayTtsUrl converts https base URLs to secure websocket URLs', () => {
  const url = buildVoiceGatewayTtsUrl('https://voice.godgodgame.com', 'token-123')

  assert.equal(
    url,
    'wss://voice.godgodgame.com/ws/tts?provider=gemini&token=token-123',
  )
})

test('buildVoiceGatewayTtsUrl keeps custom paths normalized to /ws/tts', () => {
  const url = buildVoiceGatewayTtsUrl('http://voice.example.com/base/', 'token-xyz')

  assert.equal(
    url,
    'ws://voice.example.com/base/ws/tts?provider=gemini&token=token-xyz',
  )
})

test('resolveVoiceGatewayTtsToken returns the trimmed engine token', () => {
  assert.equal(resolveVoiceGatewayTtsToken(' tts-token '), 'tts-token')
  assert.equal(resolveVoiceGatewayTtsToken(''), '')
})

test('pcm16ToWav prepends a valid wav header', () => {
  const pcm = new Uint8Array([0, 0, 255, 127])
  const wav = pcm16ToWav(pcm, 24000, 1, 16)

  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF')
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE')
  assert.equal(wav.length, 48)
})

test('voice gateway TTS source declares PCM stream format and agreed defaults', () => {
  assert.match(source, /streamFormat = 'pcm'/)
  assert.match(source, /DEFAULT_VOICE_GATEWAY_TTS_MODEL = 'gemini-3\.1-flash-tts-preview'/)
  assert.match(source, /DEFAULT_VOICE_GATEWAY_TTS_VOICE = 'Aoede'/)
  assert.equal(DEFAULT_VOICE_GATEWAY_TTS_MODEL, 'gemini-3.1-flash-tts-preview')
  assert.equal(DEFAULT_VOICE_GATEWAY_TTS_VOICE, 'Aoede')
})

test('voice gateway tts source uses synthesize id field', () => {
  assert.match(source, /type:\s*'synthesize'[\s\S]*id:\s*requestId/)
  assert.doesNotMatch(source, /type:\s*'synthesize'[\s\S]*requestId\s*:\s*requestId/)
})

test('voice gateway tts source supports client-first synthesize flow', () => {
  assert.match(source, /await sendSynthesize\(\)/)
  assert.match(source, /if \(type === 'ready'\) \{[\s\S]*await sendSynthesize\(\)/)
})
