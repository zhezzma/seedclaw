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

test('applyModelFormData preserves cost.tiers and thinkingLevelMap.max', async () => {
    const stateModule = await import('../src/components/models/model-form-state.ts').catch(() => null)

    assert.ok(stateModule && typeof stateModule.createDefaultModelFormData === 'function')
    assert.ok(stateModule && typeof stateModule.applyModelFormData === 'function')

    const formData = stateModule.createDefaultModelFormData()
    const tiers = [{
        inputTokensAbove: 200_000,
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
    }]

    stateModule.applyModelFormData(formData, {
        id: 'tiered-model',
        name: 'Tiered Model',
        reasoning: true,
        cost: {
            input: 1,
            output: 5,
            cacheRead: 0.1,
            cacheWrite: 1.25,
            tiers,
        },
        thinkingLevelMap: {
            xhigh: 'xhigh',
            max: 'max',
        },
    })

    assert.deepEqual(formData.cost.tiers, tiers)
    assert.equal(formData.thinkingLevelMap.max, 'max')
    assert.equal(formData.thinkingLevelMap.xhigh, 'xhigh')
})

test('buildModelCostForSave keeps tiers without sharing references', async () => {
    const stateModule = await import('../src/components/models/model-form-state.ts').catch(() => null)

    assert.ok(stateModule && typeof stateModule.buildModelCostForSave === 'function')

    const tiers = [{
        inputTokensAbove: 200_000,
        input: 3,
        output: 15,
        cacheRead: 0.3,
        cacheWrite: 3.75,
    }]
    const cost = {
        input: 1,
        output: 5,
        cacheRead: 0.1,
        cacheWrite: 1.25,
        tiers,
    }

    const saved = stateModule.buildModelCostForSave(cost)
    assert.deepEqual(saved.tiers, tiers)
    assert.notEqual(saved.tiers, tiers)
    assert.notEqual(saved.tiers?.[0], tiers[0])

    // 编辑非 cost 字段时仍应把 tiers 一并 PATCH 回去
    assert.equal(saved.input, 1)
    assert.equal(saved.output, 5)
})

test('applyModelFormData drops residual cost.tiers when next model has none', async () => {
    const stateModule = await import('../src/components/models/model-form-state.ts').catch(() => null)

    assert.ok(stateModule && typeof stateModule.createDefaultModelFormData === 'function')
    assert.ok(stateModule && typeof stateModule.applyModelFormData === 'function')

    const formData = stateModule.createDefaultModelFormData()

    stateModule.applyModelFormData(formData, {
        id: 'tiered-model',
        name: 'Tiered Model',
        cost: {
            input: 1,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            tiers: [{
                inputTokensAbove: 100_000,
                input: 2,
                output: 10,
                cacheRead: 0,
                cacheWrite: 0,
            }],
        },
    })

    stateModule.applyModelFormData(formData, {
        id: 'flat-model',
        name: 'Flat Model',
        cost: {
            input: 0.5,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
        },
    })

    assert.equal(formData.cost.tiers, undefined)
    assert.equal(formData.cost.input, 0.5)
})
