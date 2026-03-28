import test from 'node:test'
import assert from 'node:assert/strict'

test('new model form defaults to text + image input', async () => {
    const stateModule = await import('../src/components/models/model-form-state.ts').catch(() => null)

    assert.ok(stateModule && typeof stateModule.createDefaultModelFormData === 'function', 'createDefaultModelFormData should exist')

    const formData = stateModule.createDefaultModelFormData()

    assert.deepEqual(formData.input, ['text', 'image'])
})

test('editing legacy model without input falls back to text only', async () => {
    const stateModule = await import('../src/components/models/model-form-state.ts').catch(() => null)

    assert.ok(stateModule && typeof stateModule.createDefaultModelFormData === 'function', 'createDefaultModelFormData should exist')
    assert.ok(stateModule && typeof stateModule.applyModelFormData === 'function', 'applyModelFormData should exist')

    const formData = stateModule.createDefaultModelFormData()

    stateModule.applyModelFormData(formData, {
        id: 'legacy-model',
        name: 'Legacy Model',
    })

    assert.deepEqual(formData.input, ['text'])
})

test('model form state resets reasoning to false when next model omits the field', async () => {
    const stateModule = await import('../src/components/models/model-form-state.ts').catch(() => null)

    assert.ok(stateModule && typeof stateModule.applyModelFormData === 'function', 'applyModelFormData should exist')

    const formData = {
        id: '',
        name: '',
        contextWindow: 128000,
        maxTokens: 4096,
        cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
        },
        reasoning: false,
        input: ['text'],
    }

    stateModule.applyModelFormData(formData, {
        id: 'reasoning-model',
        name: 'Reasoning Model',
        reasoning: true,
    })

    stateModule.applyModelFormData(formData, {
        id: 'plain-model',
        name: 'Plain Model',
    })

    assert.equal(formData.reasoning, false)
})
