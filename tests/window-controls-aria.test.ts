import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

const controlsSource = read('src/components/WindowControls.vue')
const zhSource = read('src/i18n/zh.ts')
const enSource = read('src/i18n/en.ts')

test('WindowControls aria-labels go through i18n instead of hardcoded English', () => {
    assert.match(
        controlsSource,
        /useI18n\(\)/,
        'WindowControls should use the i18n composable',
    )
    // 三颗键 + 最大化/还原双态；不得残留硬编码英文 aria-label
    assert.match(controlsSource, /:aria-label="t\('common\.minimize'\)"/)
    assert.match(controlsSource, /:aria-label="isMaximized \? t\('common\.restore'\) : t\('common\.maximize'\)"/)
    assert.match(controlsSource, /:aria-label="t\('common\.close'\)"/)
    assert.doesNotMatch(
        controlsSource,
        /aria-label="(Minimize|Maximize|Restore|Close)"/,
        'no hardcoded English window-control labels allowed',
    )
})

test('window control label keys exist in both locales', () => {
    for (const [name, source] of [['zh', zhSource], ['en', enSource]] as const) {
        // 锚定 common 块（块内字符串可含 {n} 插值，不能 [^}]* 截断）：
        // common 为缩进 4 的扁平块，以其收尾的 `\n    },` 为界，避免其它区块同名键误满足断言
        const commonBlock = source.match(/common:\s*\{([\s\S]*?)\n    \},/)?.[1] ?? ''
        assert.ok(commonBlock.length > 0, `${name}.ts should have a common block`)
        for (const key of ['minimize', 'maximize', 'restore', 'close']) {
            assert.match(
                commonBlock,
                new RegExp(`${key}:\\s*['"][^'"]+['"]`),
                `${name}.ts common should define ${key}`,
            )
        }
    }
})
