import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveChildList } from '../src/composables/useA2UIState.ts'

/** a2ui visible 条件（tunnel 扩展设置表单的模式切换隐藏依赖此行为）。 */
test('resolveChildList filters children by visible condition', () => {
    const components = new Map(Object.entries({
        always: { component: 'Text', id: 'always' },
        tunnelOnly: { component: 'TextField', id: 'tunnelOnly', visible: { path: '/mode', equals: 'tunnel' } },
        lanOnly: { component: 'Text', id: 'lanOnly', visible: { path: '/mode', equals: 'lan' } },
        visibleFalse: { component: 'Text', id: 'visibleFalse', visible: false },
        visibleTrue: { component: 'Text', id: 'visibleTrue', visible: true },
        boolBinding: { component: 'Text', id: 'boolBinding', visible: { path: '/flag' } },
    }))
    const childIds = ['always', 'tunnelOnly', 'lanOnly', 'visibleFalse', 'visibleTrue', 'boolBinding', 'missing']

    // mode 为 ChoicePicker 单选数组形态 ["tunnel"]
    assert.deepEqual(
        resolveChildList(childIds, { mode: ['tunnel'], flag: false }, components),
        ['always', 'tunnelOnly', 'visibleTrue', 'missing'],
    )
    // mode = lan：tunnel 字段整体隐藏
    assert.deepEqual(
        resolveChildList(childIds, { mode: ['lan'], flag: false }, components),
        ['always', 'lanOnly', 'visibleTrue', 'missing'],
    )
    // 标量 mode（非数组）与布尔绑定
    assert.deepEqual(
        resolveChildList(childIds, { mode: 'lan', flag: true }, components),
        ['always', 'lanOnly', 'visibleTrue', 'boolBinding', 'missing'],
    )
    // visible 缺省 = 可见；未知 id 不炸（容器渲染时有 v-if 兑底）
    assert.deepEqual(
        resolveChildList(['missing'], {}, components),
        ['missing'],
    )
})
