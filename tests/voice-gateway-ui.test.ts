import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const settingsSource = readFileSync(path.join(root, 'src/views/SettingsView.vue'), 'utf8')
const speechRecognitionSource = readFileSync(path.join(root, 'src/utils/asr/speechRecognition.ts'), 'utf8')
const ttsFactorySource = readFileSync(path.join(root, 'src/utils/tts/index.ts'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')

test('settings page edits per-engine ASR and TTS config forms', () => {
  assert.match(settingsSource, /asrConfig:\s*\{[\s\S]*engine:\s*'fun-asr'/)
  assert.match(settingsSource, /ttsConfig:\s*\{[\s\S]*engine:\s*'edge'/)
  assert.match(settingsSource, /configStore\.getAsrConfig\(engine\)/)
  assert.match(settingsSource, /configStore\.getTtsConfig\(engine\)/)
  assert.match(settingsSource, /configStore\.saveAsrEngineConfig\(editForm\.value\.asrEngine,/)
  assert.match(settingsSource, /configStore\.saveTtsEngineConfig\(editForm\.value\.ttsEngine,/)
  assert.match(settingsSource, /id="asr_settings_modal"[\s\S]*settings\.baseUrl[\s\S]*editForm\.asrConfig\.baseUrl[\s\S]*settings\.engineToken[\s\S]*editForm\.asrConfig\.token[\s\S]*editForm\.asrConfig\.model/)
  assert.match(settingsSource, /id="tts_settings_modal"[\s\S]*settings\.baseUrl[\s\S]*editForm\.ttsConfig\.baseUrl[\s\S]*settings\.engineToken[\s\S]*editForm\.ttsConfig\.token[\s\S]*editForm\.ttsConfig\.model/)
})

test('settings page exposes localized voice engine options and summaries for ASR and TTS', () => {
  assert.match(settingsSource, /\$t\('settings\.asrEngineFunAsr'\)/)
  assert.match(settingsSource, /\$t\('settings\.asrEngineVoiceGateway'\)/)
  assert.match(settingsSource, /\$t\('settings\.ttsEngineQwen'\)/)
  assert.match(settingsSource, /\$t\('settings\.ttsEngineEdge'\)/)
  assert.match(settingsSource, /\$t\('settings\.ttsEngineVoiceGateway'\)/)
  assert.match(settingsSource, /getAsrEngineLabel\(configStore\.asrEngine\)/)
  assert.match(settingsSource, /getTtsEngineLabel\(configStore\.ttsEngine\)/)
  assert.match(settingsSource, /@change="onAsrEngineChange"/)
  assert.match(settingsSource, /@change="onTtsEngineChange"/)
})

test('engine selection code includes voice-gateway branches', () => {
  assert.match(speechRecognitionSource, /engineType === 'voice-gateway'/)
  assert.match(ttsFactorySource, /type === 'voice-gateway'/)
})

test('i18n includes generic engine config copy in Chinese and English', () => {
  assert.match(zhSource, /baseUrl: 'Base URL'/)
  assert.match(zhSource, /engineToken: 'Token'/)
  assert.match(zhSource, /baseUrlPlaceholder: '例如: https:\/\/voice\.godgodgame\.com'/)
  assert.match(zhSource, /asrModelPlaceholder: \"默认: \{'@'\}cf\/openai\/whisper-large-v3-turbo\"/)
  assert.match(zhSource, /engineTokenPlaceholder: '请输入当前引擎的 Token'/)
  assert.match(zhSource, /asrEngineFunAsr: 'FunASR \(阿里云实时\)'/)
  assert.match(zhSource, /asrEngineVoiceGateway: 'Voice Gateway'/)
  assert.match(zhSource, /ttsEngineVoiceGateway: 'Voice Gateway \(PCM 流式\)'/)
  assert.match(enSource, /baseUrl: 'Base URL'/)
  assert.match(enSource, /engineToken: 'Token'/)
  assert.match(enSource, /baseUrlPlaceholder: 'e\.g\. https:\/\/voice\.godgodgame\.com'/)
  assert.match(enSource, /asrModelPlaceholder: \"Default: \{'@'\}cf\/openai\/whisper-large-v3-turbo\"/)
  assert.match(enSource, /engineTokenPlaceholder: 'Enter the token for the current engine'/)
  assert.match(enSource, /asrEngineFunAsr: 'FunASR \(Aliyun Realtime\)'/)
  assert.match(enSource, /asrEngineVoiceGateway: 'Voice Gateway'/)
  assert.match(enSource, /ttsEngineVoiceGateway: 'Voice Gateway \(PCM Streaming\)'/)
})
