import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const modalSource = readFileSync(path.join(root, 'src/components/agents/AgentFormModal.vue'), 'utf8')

test('agent form reuses the shared ModelSelectMenuContent instead of a hand-rolled optgroup select', () => {
    // 创建表单复用底部输入框共用的模型选择菜单（与 ChatInput/AgentOverview 同源），
    // 不再手写 optgroup <select>
    assert.match(
        modalSource,
        /import ModelSelectMenuContent from '\.\.\/models\/ModelSelectMenuContent\.vue'/,
        'AgentFormModal should import the shared model menu content component',
    )

    assert.match(
        modalSource,
        /<ModelSelectMenuContent\s+:available-models="availableModels"\s+:current-model="selectedModelValue"/,
        'AgentFormModal should render the shared menu wired to the provider/model bridge computed',
    )

    assert.doesNotMatch(
        modalSource,
        /<select v-model="selectedModelValue"/,
        'the old native optgroup select must be removed',
    )

    assert.doesNotMatch(
        modalSource,
        /optgroup/,
        'no optgroup leftovers from the removed select',
    )
})

test('submitForm appends defaultThinkingLevel (server parses and enum-validates it)', () => {
    // 思考等级随创建/保存请求提交，服务端负责解析 + 枚举校验
    assert.match(
        modalSource,
        /data\.append\('defaultThinkingLevel', formData\.value\.defaultThinkingLevel\)/,
    )
})

test('add-mode identityName defaults to seedagent', () => {
    // 新建模式 identityName 默认 seedagent：初始 formData 与 add 分支重置各一处，
    // 编辑分支保持 identity.name || '' 不受影响
    const occurrences = modalSource.match(/identityName: 'seedagent'/g)?.length ?? 0
    assert.equal(occurrences, 2, 'initial formData and add-branch reset must both default to seedagent')
})
