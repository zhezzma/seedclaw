import test from 'node:test'
import assert from 'node:assert/strict'
import { useContextMenu } from '../src/composables/useContextMenu'

test.beforeEach(() => {
    useContextMenu().close()
})

test('useContextMenu: 模块级单例（多次调用返回同一引用）', () => {
    const a = useContextMenu()
    const b = useContextMenu()
    assert.equal(a, b)
})

test('默认 visible=false / items=[] / triggerEl=null', () => {
    const m = useContextMenu()
    assert.equal(m.visible, false)
    assert.deepEqual(m.items, [])
    assert.equal(m.triggerEl, null)
})

test('openAt 设置 visible/items/x/y', () => {
    const m = useContextMenu()
    const items = [{ label: 'A', action: () => { } }]
    m.openAt(items, { x: 10, y: 20 })
    assert.equal(m.visible, true)
    assert.equal(m.x, 10)
    assert.equal(m.y, 20)
    assert.deepEqual(m.items, items)
})

test('openAtElement 用 BoundingClientRect 算位置 + 记录 triggerEl', () => {
    const fakeRect = { right: 100, bottom: 50 } as DOMRect
    const fakeEl = {
        getBoundingClientRect: () => fakeRect,
    } as unknown as HTMLElement
    const m = useContextMenu()
    m.openAtElement([{ label: 'A', action: () => { } }], fakeEl)
    assert.equal(m.x, 100)
    assert.equal(m.y, 54) // bottom + 4
    assert.equal(m.triggerEl, fakeEl)
})

test('close 重置 visible/items/triggerEl', () => {
    const m = useContextMenu()
    m.openAt([{ label: 'A', action: () => { } }], { x: 0, y: 0 })
    m.close()
    assert.equal(m.visible, false)
    assert.deepEqual(m.items, [])
    assert.equal(m.triggerEl, null)
})

test('close 时若 triggerEl 仍可聚焦则把焦点交还（a11y）', () => {
    let focused = false
    const fakeEl = {
        getBoundingClientRect: () => ({ right: 0, bottom: 0 } as DOMRect),
        focus: () => { focused = true },
    } as unknown as HTMLElement
    // contains 默认在 jsdom-less 环境会抛；mock document.contains 返回 true
    const origContains = (globalThis as any).document?.contains
    if (!(globalThis as any).document) (globalThis as any).document = {}
    ;(globalThis as any).document.contains = () => true

    try {
        const m = useContextMenu()
        m.openAtElement([{ label: 'A', action: () => { } }], fakeEl)
        m.close()
        assert.equal(focused, true, 'close() should restore focus to the trigger element')
    } finally {
        if (origContains) {
            (globalThis as any).document.contains = origContains
        } else {
            delete (globalThis as any).document.contains
        }
    }
})

test('第二次 openAt 覆盖前一次（同时只允许一个菜单）', () => {
    const m = useContextMenu()
    m.openAt([{ label: 'first', action: () => { } }], { x: 1, y: 1 })
    m.openAt([{ label: 'second', action: () => { } }], { x: 2, y: 2 })
    assert.equal(m.items.length, 1)
    assert.equal(m.items[0].label, 'second')
    assert.equal(m.x, 2)
})
