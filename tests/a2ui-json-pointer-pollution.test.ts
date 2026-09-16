import test from 'node:test'
import assert from 'node:assert/strict'

import { setByPath } from '../src/utils/json-pointer.ts'
import { updateSurfaceDataModel, getSurface } from '../src/composables/useA2UISurfaces.ts'

/**
 * A2UI 数据模型原型污染回归测试（代码审核 #2）。
 *
 * 背景：A2UI updateDataModel 的 path/value 都来自 AI 输出。
 * 活路径是 useA2UISurfaces.updateSurfaceDataModel（useChatMessages 调用），
 * 裸遍历 / Object.assign 时 `/__proto__/x`、`/constructor/prototype/x`
 * 与根路径 own key "__proto__" 均可污染 Object.prototype。
 * 修复：所有写入方共用 utils/json-pointer 的防护版 setByPath。
 */

test('setByPath rejects __proto__/constructor/prototype traversal', () => {
    const obj: any = { list: [{}] }

    setByPath(obj, '/__proto__/polluted', 'pwned')
    setByPath(obj, '/constructor/prototype/x', 1)
    setByPath(obj, '/list/0/__proto__/y', 1)

    assert.equal(({} as any).polluted, undefined)
    assert.equal(({} as any).x, undefined)
    assert.equal(({} as any).y, undefined)
    // 合法兄弟字段不受影响
    assert.deepEqual(obj.list, [{}])
})

test('setByPath root merge skips unsafe own keys but keeps safe ones', () => {
    // JSON.parse 会把 "__proto__" 建成 own key（绕过它必须走这条路径构造）
    const value = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}')
    const obj: any = {}
    setByPath(obj, '/', value)
    assert.equal(({} as any).polluted, undefined)
    assert.equal(obj.ok, 1)
})

test('setByPath still performs normal writes (arrays, nested objects, root merge)', () => {
    const obj: any = { list: [{ n: 0 }] }
    setByPath(obj, '/list/0/n', 5)
    setByPath(obj, '/a/b', 'c')
    setByPath(obj, '/', JSON.parse('{"top": true}'))
    assert.equal(obj.list[0].n, 5)
    assert.equal(obj.a.b, 'c')
    assert.equal(obj.top, true)
})

test('live path updateSurfaceDataModel cannot pollute Object.prototype', () => {
    assert.equal(updateSurfaceDataModel('t-pollute-proto', '/__proto__/polluted', 'pwned'), true)
    assert.equal(updateSurfaceDataModel('t-pollute-ctor', '/constructor/prototype/x', 1), true)
    assert.equal(
        updateSurfaceDataModel('t-pollute-root', '/', JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}')),
        true
    )

    assert.equal(({} as any).polluted, undefined)
    assert.equal(({} as any).x, undefined)
})

test('live path updateSurfaceDataModel still writes normal values', () => {
    assert.equal(updateSurfaceDataModel('t-ok', '/user/name', 'alice'), true)
    assert.equal(getSurface('t-ok')?.dataModel.user.name, 'alice')

    // 幂等去重：相同内容第二次不再执行
    assert.equal(updateSurfaceDataModel('t-ok', '/user/name', 'alice'), false)
})
