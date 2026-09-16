import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = readFileSync(path.join(root, 'src/components/agents/tabs/AgentSubagents.vue'), 'utf8')

test('subagent edit form mounts extensions inline (whitelist checkboxes), not via a separate a2ui dialog', () => {
    // 扩展挂载并入编辑/新建表单：白名单勾选列表 + 全选切换 + 随表单一次保存
    assert.match(
        source,
        /const selectedExtensions = ref<string\[\]>\(\[\]\)/,
        'selectedExtensions whitelist state must exist',
    )

    assert.match(
        source,
        /formData\.value\.extensions = \[\.\.\.selectedExtensions\.value\]/,
        'save payload must carry the whitelist (empty array = mount none)',
    )

    assert.match(
        source,
        /@change="toggleExtensionSelection\(ext\.id\)"/,
        'extension checkboxes must be wired to the whitelist toggle',
    )

    assert.match(
        source,
        /'agent\.subagents\.extensionsHint'/,
        'whitelist semantics hint key must be referenced',
    )

    assert.match(
        source,
        /selectedExtensions\.value = \[\.\.\.\(subagent\.extensions \?\? \[\]\)\]/,
        'edit mode must seed the whitelist from the subagent config',
    )

    // 旧入口彻底移除：卡片拼图按钮与独立 a2ui 挂载弹层
    assert.doesNotMatch(source, /A2UIFormDialog/, 'the separate a2ui mount dialog must be removed')
    assert.doesNotMatch(source, /PuzzlePieceIcon/, 'the card puzzle button must be removed')
    assert.doesNotMatch(source, /mount-form/, 'the mount-form endpoint URL must not be referenced')
})

test('mountable extension list comes from GET /api/extensions filtered by enabled', () => {
    assert.match(
        source,
        /apiGet<Array<\{ id: string; name: string; enabled: boolean \}>>\('\/api\/extensions'\)/,
        'list source must be the existing extension index endpoint',
    )
    assert.match(
        source,
        /raw\.filter\(\(e\) => e\.enabled\)/,
        'globally disabled extensions must be filtered out of the mountable list',
    )
})

test('mounted-but-disabled extension ids stay visible instead of silently disappearing', () => {
    // 并集兑底：已勾选但不在可挂载清单（如已全局禁用）的 id 仍显示，带标记
    assert.match(
        source,
        /const extensionOptions = computed\(\(\) => \{/,
        'union options computed must exist',
    )
    assert.match(
        source,
        /extensionGloballyDisabled/,
        'disabled marker badge must be rendered for non-mountable mounted ids',
    )
})
