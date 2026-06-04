import type {
    AvailableModel,
    ThinkingLevelMap,
} from '../../composables/useModelsState'

export interface ModelFormState {
    id: string
    name: string
    contextWindow: number
    maxTokens: number
    cost: {
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
    }
    reasoning: boolean
    input: string[]
    thinkingLevelMap: ThinkingLevelMap
}

export function createDefaultModelFormData(): ModelFormState {
    return {
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
        input: ['text', 'image'],
        thinkingLevelMap: {},
    }
}

export function applyModelFormData(target: ModelFormState, initialData?: AvailableModel): ModelFormState {
    const defaults = createDefaultModelFormData()

    // 先回到完整默认值，再覆写已有字段，避免上一次编辑残留在当前表单中。
    target.id = initialData?.id ?? defaults.id
    target.name = initialData?.name ?? defaults.name
    target.contextWindow = initialData?.contextWindow ?? defaults.contextWindow
    target.maxTokens = initialData?.maxTokens ?? defaults.maxTokens
    target.cost = {
        input: initialData?.cost?.input ?? defaults.cost.input,
        output: initialData?.cost?.output ?? defaults.cost.output,
        cacheRead: initialData?.cost?.cacheRead ?? defaults.cost.cacheRead,
        cacheWrite: initialData?.cost?.cacheWrite ?? defaults.cost.cacheWrite,
    }
    target.reasoning = initialData?.reasoning ?? defaults.reasoning
    target.input = initialData
        ? [...(initialData.input?.length ? initialData.input : ['text'])]
        : [...defaults.input]
    // 深拷避免表单编辑直接窜改到 state.providers 里的原始对象。
    target.thinkingLevelMap = { ...(initialData?.thinkingLevelMap ?? {}) }

    return target
}
