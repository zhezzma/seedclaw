import { TTSEngine } from './types'
import { QwenTTS } from './qwen-tts'
import { EdgeTTS } from './edge-tts'
import { useUiSettingsStore } from '../../stores/setting'

export function createTTSEngine(): TTSEngine {
    const store = useUiSettingsStore()
    const type = store.ttsEngine

    if (type === 'qwen') {
        return new QwenTTS()
    } else {
        // Default to EdgeTTS
        return new EdgeTTS()
    }
}
