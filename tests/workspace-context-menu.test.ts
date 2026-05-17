import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
function read(rel: string): string {
    return readFileSync(path.resolve(dir, '..', rel), 'utf8')
}

test('ContextMenu.vue: Teleport to body + role=menu/menuitem + Esc + 防溢出 + 焦点循环', () => {
    const src = read('src/components/workspace/ContextMenu.vue')

    // 必须 Teleport 到 body：panel / drawer 都有 overflow-hidden，菜单不能被裁
    assert.match(src, /<Teleport to="body">/, 'must teleport menu to body to escape overflow clipping')

    // ARIA Menu pattern
    assert.match(src, /role="menu"/, 'menu container must have role=menu')
    assert.match(src, /role="menuitem"/, 'each item button must have role=menuitem')
    assert.match(src, /role="separator"/, 'separator <li> must have role=separator')
    assert.match(src, /:aria-disabled=/, 'disabled items must surface aria-disabled')

    // Esc 关闭 + listener 释放
    assert.match(src, /Escape/, 'must close on Esc')
    assert.match(src, /addEventListener\(['"]keydown/, 'must add keydown listener on mount')
    assert.match(src, /removeEventListener\(['"]keydown/, 'must release keydown listener on unmount')

    // Tab 关菜单并交还焦点给触发元素
    assert.match(src, /e\.key === 'Tab'/, 'Tab must close menu and return focus to trigger')

    // 视口防溢出（finalX / finalY 在 watch 中按 innerWidth / innerHeight 矫正）
    assert.match(src, /innerWidth/, 'must clamp x against viewport innerWidth')
    assert.match(src, /innerHeight/, 'must clamp y against viewport innerHeight')

    // 键盘焦点循环 + 自动聚焦首项
    assert.match(src, /ArrowDown/, 'must support ArrowDown to move focus down')
    assert.match(src, /ArrowUp/, 'must support ArrowUp to move focus up')
    assert.match(src, /\.focus\(\)/, 'must autofocus the first focusable item on open')

    // overlay 点击关闭；阻止 menu 内点击冒泡到 overlay
    assert.match(src, /@click="menu\.close\(\)"/, 'overlay click must close the menu')
    assert.match(src, /@click\.stop/, 'menu container click must stop propagation to overlay')
})
