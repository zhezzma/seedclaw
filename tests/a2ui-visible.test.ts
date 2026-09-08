import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveChildList, executeFunctionCall } from '../src/composables/useA2UIState.ts'

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

/** equals FunctionCall 与 {path, equals} 简写必须同语义（宽松 == + 数组取首元素）。 */
test('executeFunctionCall equals unwraps arrays and compares loosely like the visible shorthand', () => {
    // ChoicePicker 单选写入数组形态：FunctionCall 形式同样取首元素（与简写一致）
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/mode' }, other: 'tunnel' } }, { mode: ['tunnel'] }),
        true,
    )
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/mode' }, other: 'lan' } }, { mode: ['tunnel'] }),
        false,
    )
    // 标量形态
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/mode' }, other: 'lan' } }, { mode: 'lan' }),
        true,
    )
    // 宽松 ==：字符串与数字互通（"18799" == 18799）
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/port' }, other: 18799 } }, { port: '18799' }),
        true,
    )
})

/** 多元素数组是新旧实现的真正分叉点：解包取首元素（true）vs 旧宽松 == 的 join（false）。 */
test('executeFunctionCall equals unwraps multi-element arrays (real divergence from legacy ==)', () => {
    // 单元素数组因 ToPrimitive 巧合两态同值，锁不住解包语义；必须用多元素
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/mode' }, other: 'tunnel' } }, { mode: ['tunnel', 'x'] }),
        true,
    )
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/mode' }, other: 'lan' } }, { mode: ['tunnel', 'x'] }),
        false,
    )
})

/** 布尔与字符串的规范化比较：CheckBox 写入布尔 true 时 equals:"true" 不得永久失配。 */
test('looseEquals normalizes boolean vs string (CheckBox true vs equals:"true")', () => {
    const components = new Map(Object.entries({
        checkOn: { component: 'Text', id: 'checkOn', visible: { path: '/flag', equals: 'true' } },
        checkOff: { component: 'Text', id: 'checkOff', visible: { path: '/flag', equals: 'false' } },
        literalBool: { component: 'Text', id: 'literalBool', visible: { path: '/flag', equals: true } },
    }))
    const ids = ['checkOn', 'checkOff', 'literalBool']
    // CheckBox 写入布尔 true：字符串 "true" 必须匹配（旧实现 true == "true" 为 false，字段静默隐藏）
    assert.deepEqual(resolveChildList(ids, { flag: true }, components), ['checkOn', 'literalBool'])
    // flag=false：equals:"false" 命中；布尔字面量 equals:true 不等则隐藏
    assert.deepEqual(resolveChildList(ids, { flag: false }, components), ['checkOff'])
    // equals FunctionCall 形式同语义（共用 looseEquals）
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/flag' }, other: 'true' } }, { flag: true }),
        true,
    )
    // 布尔规范化后的语义分叉锁："1"/"0"/"" 不再命中布尔（旧宽松 == 曾命中），
    // 服务端 DSL 若用字符串匹配布尔必须写 "true"/"false"
    assert.equal(
        executeFunctionCall({ call: 'equals', args: { value: { path: '/flag' }, other: '1' } }, { flag: true }),
        false,
    )
})

/** resolveVisibility 简写字面量侧数组同样解包取首元素（多元素用例锁定两侧对称解包）。 */
test('resolveChildList visible shorthand handles array literal on the equals side', () => {
    const components = new Map(Object.entries({
        a: { component: 'Text', id: 'a', visible: { path: '/mode', equals: ['tunnel'] } },
        b: { component: 'Text', id: 'b', visible: { path: '/mode', equals: ['tunnel', 'x'] } },
    }))
    assert.deepEqual(resolveChildList(['a'], { mode: 'tunnel' }, components), ['a'])
    // 多元素字面量数组：解包取首元素比较（旧实现的 'tunnel' == 'tunnel,x' 为 false，必挂）
    assert.deepEqual(resolveChildList(['b'], { mode: 'tunnel' }, components), ['b'])
    assert.deepEqual(resolveChildList(['b'], { mode: 'lan' }, components), [])
})
