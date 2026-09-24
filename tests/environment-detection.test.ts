import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

const environmentSource = read('src/utils/environment.ts')
const consumers = [
    'src/components/ViewHeader.vue',
    'src/components/AppSidebar.vue',
    'src/components/WindowControls.vue',
    'src/components/workspace/WorkspacePanel.vue',
]

test('environment util exposes a single source of truth for desktop Tauri detection', () => {
    assert.match(
        environmentSource,
        /export const isDesktopTauri/,
        'utils/environment.ts should export isDesktopTauri',
    )
    // 语义 = Tauri 运行时注入 && 非 UA 移动端（缺一不可）
    assert.match(
        environmentSource,
        /__TAURI_INTERNALS__\s*\|\|\s*.*__TAURI__/,
        'isDesktopTauri must detect the Tauri runtime via injected globals',
    )
    assert.match(
        environmentSource,
        /Android\|iPhone\|iPad\|iPod/,
        'isDesktopTauri must exclude mobile user agents',
    )
})

test('all four window-decoration consumers import isDesktopTauri instead of inlining detection', () => {
    for (const rel of consumers) {
        const source = read(rel)
        assert.match(
            source,
            /import \{ isDesktopTauri \} from ['"][^'"]*utils\/environment(\.ts)?['"]/,
            `${rel} should import isDesktopTauri from utils/environment`,
        )
        assert.doesNotMatch(
            source,
            /__TAURI_INTERNALS__/,
            `${rel} must not inline the Tauri runtime detection anymore`,
        )
        assert.doesNotMatch(
            source,
            /Android\|iPhone\|iPad\|iPod/,
            `${rel} must not inline the mobile UA exclusion anymore`,
        )
    }
})
