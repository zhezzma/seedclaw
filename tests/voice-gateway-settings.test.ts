import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

class MemoryStorage implements Storage {
    private data = new Map<string, string>()

    get length() {
        return this.data.size
    }

    clear() {
        this.data.clear()
    }

    getItem(key: string) {
        return this.data.has(key) ? this.data.get(key)! : null
    }

    key(index: number) {
        return Array.from(this.data.keys())[index] ?? null
    }

    removeItem(key: string) {
        this.data.delete(key)
    }

    setItem(key: string, value: string) {
        this.data.set(key, value)
    }
}

const originalLocalStorage = globalThis.localStorage
const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
})

const createStore = async () => {
    setActivePinia(createPinia())
    const mod = await import('../src/stores/setting.ts')
    return mod.useUiSettingsStore()
}

test.after(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
    })
})

test.beforeEach(() => {
    storage.clear()
})

test('defaults voice settings to normalized per-engine config arrays', async () => {
    const store = await createStore()

    assert.equal(store.asrEngine, 'fun-asr')
    assert.equal(store.ttsEngine, 'edge')
    assert.deepEqual(store.asrConfigs, [
        { engine: 'fun-asr', baseUrl: '', token: '', model: '' },
        { engine: 'voice-gateway', baseUrl: 'https://voice.godgodgame.com', token: '', model: '@cf/openai/whisper-large-v3-turbo' },
    ])
    assert.deepEqual(store.ttsConfigs, [
        { engine: 'edge', baseUrl: '', token: '', model: '' },
        { engine: 'qwen', baseUrl: '', token: '', model: '' },
        { engine: 'voice-gateway', baseUrl: 'https://voice.godgodgame.com', token: '', model: 'gemini-3.1-flash-tts-preview' },
    ])
})

test('resolves current configs and token getters from selected engines', async () => {
    const store = await createStore()

    assert.deepEqual(store.currentAsrConfig, { engine: 'fun-asr', baseUrl: '', token: '', model: '' })
    assert.deepEqual(store.currentTtsConfig, { engine: 'edge', baseUrl: '', token: '', model: '' })
    assert.equal(store.hasAsrToken, false)
    assert.equal(store.hasTtsToken, true)

    store.save({
        asrEngine: 'voice-gateway',
        ttsEngine: 'qwen',
    })
    store.saveAsrEngineConfig('voice-gateway', {
        token: 'asr-token',
        model: 'whisper-custom',
        baseUrl: 'https://voice.example.com',
    })
    store.saveTtsEngineConfig('qwen', {
        token: 'tts-token',
        model: 'qwen-model',
    })

    assert.deepEqual(store.currentAsrConfig, {
        engine: 'voice-gateway',
        token: 'asr-token',
        model: 'whisper-custom',
        baseUrl: 'https://voice.example.com',
    })
    assert.deepEqual(store.currentTtsConfig, {
        engine: 'qwen',
        token: 'tts-token',
        model: 'qwen-model',
        baseUrl: '',
    })
    assert.equal(store.hasAsrToken, true)
    assert.equal(store.hasTtsToken, true)
})

test('save helpers overwrite same-engine config and persist reloadable shape', async () => {
    const store = await createStore()

    store.save({
        asrEngine: 'voice-gateway',
        ttsEngine: 'voice-gateway',
    })
    store.saveAsrEngineConfig('voice-gateway', {
        baseUrl: 'https://voice.example.com',
        token: 'token-123',
        model: 'stt-model',
    })
    store.saveTtsEngineConfig('voice-gateway', {
        baseUrl: 'https://voice.example.com',
        token: 'token-456',
        model: 'tts-model',
    })

    const persisted = JSON.parse(storage.getItem('openclaw_config') || '{}')
    assert.equal(persisted.asrEngine, 'voice-gateway')
    assert.equal(persisted.ttsEngine, 'voice-gateway')
    assert.deepEqual(persisted.asrConfigs.find((item: any) => item.engine === 'voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://voice.example.com',
        token: 'token-123',
        model: 'stt-model',
    })
    assert.deepEqual(persisted.ttsConfigs.find((item: any) => item.engine === 'voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://voice.example.com',
        token: 'token-456',
        model: 'tts-model',
    })

    const reloaded = await createStore()
    assert.equal(reloaded.asrEngine, 'voice-gateway')
    assert.equal(reloaded.ttsEngine, 'voice-gateway')
    assert.deepEqual(reloaded.getAsrConfig('voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://voice.example.com',
        token: 'token-123',
        model: 'stt-model',
    })
    assert.deepEqual(reloaded.getTtsConfig('voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://voice.example.com',
        token: 'token-456',
        model: 'tts-model',
    })
})

test('migrates legacy flat voice settings into normalized engine configs', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        asrEngine: 'voice-gateway',
        ttsEngine: 'voice-gateway',
        asrToken: 'legacy-asr-token',
        asrModel: 'legacy-asr-model',
        ttsToken: 'legacy-tts-token',
        ttsModel: 'legacy-tts-model',
        voiceGatewayUrl: 'https://reload.example.com',
        voiceGatewayToken: 'legacy-shared-token',
    }))

    const store = await createStore()

    assert.deepEqual(store.getAsrConfig('voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://reload.example.com',
        token: 'legacy-asr-token',
        model: 'legacy-asr-model',
    })
    assert.deepEqual(store.getTtsConfig('voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://reload.example.com',
        token: 'legacy-tts-token',
        model: 'legacy-tts-model',
    })
    assert.deepEqual(store.getAsrConfig('fun-asr'), {
        engine: 'fun-asr',
        baseUrl: '',
        token: '',
        model: '',
    })
})

test('load persists normalized settings after legacy migration', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        asrEngine: 'voice-gateway',
        asrToken: 'legacy-asr-token',
        asrModel: 'legacy-asr-model',
        voiceGatewayUrl: 'https://reload.example.com',
    }))

    await createStore()

    const persisted = JSON.parse(storage.getItem('openclaw_config') || '{}')
    assert.ok(Array.isArray(persisted.asrConfigs))
    assert.equal(persisted.asrToken, undefined)
    assert.equal(persisted.asrModel, undefined)
    assert.equal(persisted.voiceGatewayUrl, undefined)
})

test('legacy ASR migration does not overwrite existing normalized fun-asr config', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        asrEngine: 'voice-gateway',
        asrToken: 'legacy-asr-token',
        asrModel: 'legacy-asr-model',
        asrConfigs: [
            { engine: 'fun-asr', baseUrl: '', token: 'fun-token', model: 'fun-model' },
            { engine: 'voice-gateway', baseUrl: 'https://voice.example.com', token: '', model: '' },
        ],
    }))

    const store = await createStore()

    assert.deepEqual(store.getAsrConfig('voice-gateway'), {
        engine: 'voice-gateway',
        baseUrl: 'https://voice.example.com',
        token: 'legacy-asr-token',
        model: 'legacy-asr-model',
    })
    assert.deepEqual(store.getAsrConfig('fun-asr'), {
        engine: 'fun-asr',
        baseUrl: '',
        token: 'fun-token',
        model: 'fun-model',
    })
})

test('legacy TTS migration does not overwrite normalized qwen config when current engine is edge', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        ttsEngine: 'edge',
        ttsToken: 'legacy-tts-token',
        ttsModel: 'legacy-tts-model',
        ttsConfigs: [
            { engine: 'edge', baseUrl: '', token: '', model: '' },
            { engine: 'qwen', baseUrl: '', token: 'qwen-token', model: 'qwen-model' },
            { engine: 'voice-gateway', baseUrl: 'https://voice.example.com', token: 'vg-token', model: 'vg-model' },
        ],
    }))

    const store = await createStore()

    assert.deepEqual(store.getTtsConfig('qwen'), {
        engine: 'qwen',
        baseUrl: '',
        token: 'qwen-token',
        model: 'qwen-model',
    })
    assert.equal(store.ttsEngine, 'edge')
})
