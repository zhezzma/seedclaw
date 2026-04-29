import { TTSEngine } from './types'
import { QwenTTS } from './qwen-tts'
import { EdgeTTS } from './edge-tts'
import { VoiceGatewayTTS } from './voice-gateway'
import { useUiSettingsStore } from '../../stores/setting'

export function createTTSEngine(): TTSEngine {
    const store = useUiSettingsStore()
    const type = store.ttsEngine

    if (type === 'qwen') {
        return new QwenTTS()
    }

    if (type === 'voice-gateway') {
        return new VoiceGatewayTTS()
    }

    // Default to EdgeTTS
    return new EdgeTTS()
}
