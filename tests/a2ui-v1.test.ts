import test from 'node:test'
import assert from 'node:assert/strict'
import {
    A2UI_VERSION,
    SEEDCLAW_BASIC_CATALOG_ID,
    isSupportedA2uiMessage,
    isSurfaceCatalogAllowed,
    isComponentCatalogAllowed,
} from '../src/components/a2ui/types.ts'
import { useA2UIState, resolveDynamicBoolean } from '../src/composables/useA2UIState.ts'

/** v1.0 硬切：非 v1.0 envelope 一律拒绝 */
test('isSupportedA2uiMessage rejects non-v1.0 envelopes', () => {
    assert.equal(isSupportedA2uiMessage({ version: 'v1.0', createSurface: { surfaceId: 's' } }), true)
    assert.equal(isSupportedA2uiMessage({ version: 'v0.9', createSurface: { surfaceId: 's' } }), false)
    assert.equal(isSupportedA2uiMessage({ createSurface: { surfaceId: 's' } }), false)
    assert.equal(isSupportedA2uiMessage(null), false)
    assert.equal(isSupportedA2uiMessage('v1.0'), false)
    assert.equal(A2UI_VERSION, 'v1.0')
})

/** v1.0 catalogId 解析：surface 默认 catalog 仅接受本渲染端私有 catalog（缺省允许） */
test('isSurfaceCatalogAllowed enforces private catalog resolution', () => {
    assert.equal(isSurfaceCatalogAllowed(undefined), true)
    assert.equal(isSurfaceCatalogAllowed(SEEDCLAW_BASIC_CATALOG_ID), true)
    assert.equal(isSurfaceCatalogAllowed('question_catalog'), false)
    assert.equal(isSurfaceCatalogAllowed('https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'), false)
})

/** 组件级 catalogId：非对象或非本渲染端 catalog 的组件不渲染 */
test('isComponentCatalogAllowed drops foreign-catalog components', () => {
    assert.equal(isComponentCatalogAllowed({ id: 'a' }), true)
    assert.equal(isComponentCatalogAllowed({ id: 'a', catalogId: SEEDCLAW_BASIC_CATALOG_ID }), true)
    assert.equal(isComponentCatalogAllowed({ id: 'a', catalogId: 'other.com:cat' }), false)
    // 非对象（null/标量）不是合法组件：直接丢弃，避免后续渲染层炸
    assert.equal(isComponentCatalogAllowed(null), false)
    assert.equal(isComponentCatalogAllowed('Text'), false)
})

/** v1.0 ValidationResult：{valid} 解包，布尔返回值兼容 */
test('resolveDynamicBoolean unwraps ValidationResult objects', () => {
    const dataModel = {
        structured: { valid: false, code: 'X', message: 'bad' },
        structuredOk: { valid: true },
        plain: false,
    }
    assert.equal(resolveDynamicBoolean({ path: '/structured' }, dataModel), false)
    assert.equal(resolveDynamicBoolean({ path: '/structuredOk' }, dataModel), true)
    assert.equal(resolveDynamicBoolean({ path: '/plain' }, dataModel), false)
    // FunctionCall 返回 ValidationResult 同样解包（not(...) 产出布尔不受影响）
    assert.equal(resolveDynamicBoolean({ call: 'not', args: { value: { path: '/plain' } } }, dataModel), true)
})

/** v1.0 单消息整面 UI：createSurface 内联 components + 初始 dataModel */
test('processMessage applies inline createSurface components and dataModel', () => {
    const { processMessage, getSurface, clearAll } = useA2UIState()
    clearAll()
    const surfaceId = `inline-${Date.now()}`
    processMessage({
        version: A2UI_VERSION,
        createSurface: {
            surfaceId,
            catalogId: SEEDCLAW_BASIC_CATALOG_ID,
            components: [
                { id: 'root', component: 'Column', children: ['text'] },
                { id: 'text', component: 'Text', text: 'hi' },
            ],
            dataModel: { foo: 'bar' },
        },
    } as any)

    const surface = getSurface(surfaceId)
    assert.ok(surface)
    assert.deepEqual(surface!.rootComponentIds, ['root'])
    assert.equal(surface!.components.get('text')?.component, 'Text')
    assert.equal(surface!.dataModel.foo, 'bar')
    clearAll()
})
