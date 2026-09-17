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

test('extensionsMode: custom/config radio switches whitelist vs global-default source', () => {
    // 模式切换 radio：custom（自身白名单，默认）/ config（跟随全局「动态子代理默认扩展集」）
    assert.match(
        source,
        /value="custom"\s*\n\s*v-model="formData\.extensionsMode"/,
        'custom mode radio must bind formData.extensionsMode',
    )
    assert.match(
        source,
        /value="config"\s*\n\s*v-model="formData\.extensionsMode"/,
        'config mode radio must bind formData.extensionsMode',
    )

    // 旧数据/非法真值归一化：编辑时归为两态之一，radio 才能正确选中
    assert.match(
        source,
        /formData\.value\.extensionsMode = subagent\.extensionsMode === 'config' \? 'config' : 'custom'/,
        'edit mode must normalize extensionsMode into the two-state value',
    )

    // config 模式下勾选区隐藏，仅显示跟随全局默认集的提示；custom 模式才显示白名单区
    assert.match(
        source,
        /v-if="formData\.extensionsMode === 'config'"[\s\S]*?extensionsModeConfigHint/,
        'config mode must show the follow-global hint instead of the checkbox area',
    )
    assert.match(
        source,
        /<template v-else>[\s\S]*?extensionsHint/,
        'custom mode must render the whitelist hint + checkbox area',
    )

    // 全选按钮只在 custom 模式出现
    assert.match(
        source,
        /v-if="formData\.extensionsMode === 'custom' && extensionOptions\.length > 0"/,
        'select-all button must be custom-mode only',
    )

    // 保存归一化：只允许 custom/config 两态入 wire payload
    assert.match(
        source,
        /formData\.value\.extensionsMode = formData\.value\.extensionsMode === 'config' \? 'config' : 'custom'/,
        'save must normalize extensionsMode into the two-state wire value',
    )

    // 卡片徽章：config 模式优先显示跟随全局徽章，否则按白名单数量
    assert.match(
        source,
        /v-if="agent\.extensionsMode === 'config'"[\s\S]*?extensionsModeConfigBadge/,
        'card badge must reflect config mode before falling back to whitelist count',
    )
})

test('useSubAgents type carries extensionsMode through the wire layer', () => {
    const composable = readFileSync(path.join(root, 'src/composables/useSubAgents.ts'), 'utf8')
    assert.match(
        composable,
        /extensionsMode\?: 'custom' \| 'config'/,
        'SubagentConfig must declare the extensionsMode wire field',
    )
})
