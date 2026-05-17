import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
function read(rel: string): string {
    return readFileSync(path.resolve(dir, '..', rel), 'utf8')
}

const src = read('src/composables/useFileActions.ts')

test('useFileActions: scope=agent 用 @agent: 前缀，scope=workspace 用 @ 前缀', () => {
    // 关键：避免 namespace 串台。workspace 文件的 @path 与 agent 配置文件的 @agent:path 必须分流
    assert.match(
        src,
        /scope === 'agent' \? `@agent:\$\{entry\.path\}` : `@\$\{entry\.path\}`/,
        'mention syntax must split workspace (@) and agent (@agent:) namespaces',
    )
})

test('useFileActions: 目录 entry 上禁用 file-only 操作', () => {
    // 复制 @引用 / 发送 @引用 / 发送内容 在目录上没有意义，必须 disabled
    const disabledMatches = src.match(/disabled: !isFile/g)
    assert.ok(disabledMatches && disabledMatches.length >= 3,
        `expected at least 3 'disabled: !isFile' (copyMention / sendMention / sendContent), got ${disabledMatches?.length ?? 0}`)
})

test('useFileActions: sendContent 必须区分 binary / truncated / 错误三态，并通过 toast 上报', () => {
    // 必须把 binary 单独 warning，不当成正常发送
    assert.match(src, /data\.binary/, 'sendContent must check binary')
    assert.match(src, /toast\.warning\(tr\('workspace\.binaryFile'\)\)/, 'binary must emit binaryFile toast')

    // 截断也是 warning（用户的 chat 里有内容，但要知道是不完整的）
    assert.match(src, /data\.truncated/, 'sendContent must check truncated')
    assert.match(src, /workspace\.menu\.contentTruncated/, 'truncated must use contentTruncated key')

    // 错误必须 toast，不能静默吞
    assert.match(src, /catch \(e: any\)/, 'sendContent must catch fetch errors')
    assert.match(
        src,
        /toast\.error\(`\$\{tr\('workspace\.menu\.sendContent'\)\}: \$\{e\?\.message \|\| String\(e\)\}`\)/,
        'fetch errors must include the action name as context prefix',
    )
})

test('useFileActions: appendToChatInput 走 useChatInput.appendText\uff08\u907f\u514d\u8df3\u8fc7 history \u91cd\u7f6e\uff09', () => {
    // 不能直接戳 inputText.value：会与 useChatInput 内部的 historyIndex / savedDraft 失同步，
    // 用户在历史浏览态时 ArrowDown 会把追加的文本吃掉。
    assert.match(src, /useChatInput\(\)\.appendText/, 'must call useChatInput().appendText, not write inputText directly')
    assert.doesNotMatch(
        src,
        /ci\.inputText\.value\s*=/,
        'must NOT assign to inputText.value directly (would skip history reset)',
    )
})

test('useChatInput: appendText \u91cd\u7f6e history \u72b6\u6001\u540e\u518d\u5199\u5165', () => {
    const ci = read('src/composables/useChatInput.ts')
    // appendText 必须存在
    assert.match(ci, /const appendText = \(text: string\)/, 'must export appendText')
    // 必须显式重置 historyIndex / savedDraft；防止后续 ArrowDown 恢复 savedDraft 吞掉追加
    assert.match(
        ci,
        /const appendText[\s\S]+historyIndex\.value = -1[\s\S]+savedDraft\.value = ''/,
        'appendText must reset historyIndex and savedDraft before mutating inputText',
    )
    // 暴露在 export 里
    assert.match(ci, /\bappendText,/, 'appendText must be exported via _chatInputState')
})

test('useFileActions: fenceContent 根据 content 里最长连续反引号自适应 fence 长度', () => {
    // README / SKILL.md 里本身会出现 ``` 代码块，外层不能写死三反引号，
    // 否则内部的 ``` 会提前关闭外层，chat 渲染乱且 agent 拿到的也不再是单一 code block。
    assert.match(
        src,
        /content\.match\(\/`\+\/g\)/,
        'fenceContent must scan content for backtick runs',
    )
    assert.match(
        src,
        /'`'\.repeat\(Math\.max\(3, longest \+ 1\)\)/,
        'fenceContent must use longest+1 backticks (≥3) so inner ``` cannot close it',
    )
})

test('useFileActions: 菜单提供绝对 + 相对两种复制路径', () => {
    // 拆分是 UX 调整 — 不要回退到单一 copyPath
    assert.match(src, /workspace\.menu\.copyAbsolutePath/, 'must offer copyAbsolutePath as a distinct item')
    assert.match(src, /workspace\.menu\.copyRelativePath/, 'must offer copyRelativePath as a distinct item')
    assert.doesNotMatch(src, /workspace\.menu\.copyPath\b/, 'must NOT keep the legacy copyPath key')
    // 绝对路径需要拼 root + entry.path，走专用 helper
    assert.match(src, /buildAbsolutePath\(root, entry\.path\)/, 'absolute path action must call buildAbsolutePath with explicit root from caller')
})

test('useFileActions: 不跨模块 import composable（避免 HMR 下 singleton 分裂）', () => {
    // 原本该文件 import 了 useWorkspaceTree / useAgentFiles 去拿 root，
    // 但 Vite HMR 重求值后出现多个独立 singleton，导致 FileTreeNode 读不到
    // WorkspaceTabFiles 写进去的 expanded 状态 → 目录点不开。
    // 修复后 root 由调用者从自己的 composable 拿并传入 args。
    assert.doesNotMatch(src, /from\s+['\"]\.\/useWorkspaceTree['\"]/,
        'must NOT import useWorkspaceTree (cross-module composable singleton splits under HMR)')
    assert.doesNotMatch(src, /from\s+['\"]\.\/useAgentFiles['\"]/,
        'must NOT import useAgentFiles (cross-module composable singleton splits under HMR)')
    // BuildArgs 必须接受 root，调用者负责传入
    assert.match(src, /root:\s*string\s*\|\s*null/, 'BuildArgs must require root passed in by caller')
})

test('useFileActions.buildAbsolutePath: 跨平台拼接 + 缺省安全退退', () => {
    // root 拿不到 → 退回 relPath，不会报错丢 "undefined/..."
    assert.match(src, /if \(!root\) return relPath/, 'must fall back to relPath when root is unavailable')
    // Windows 路径含反斜杠时，entry.path 的正斜杠要被转为反斜杠，避免混合分隔符
    assert.match(
        src,
        /root\.includes\('\\\\'\)/,
        'must detect Windows roots by backslash presence',
    )
})

test('useFileActions: i18n key 与原 copyPath 不再共存', () => {
    const en = read('src/i18n/en.ts')
    const zh = read('src/i18n/zh.ts')
    assert.match(en, /copyAbsolutePath:/, 'en must define copyAbsolutePath')
    assert.match(en, /copyRelativePath:/, 'en must define copyRelativePath')
    assert.match(zh, /copyAbsolutePath:/, 'zh must define copyAbsolutePath')
    assert.match(zh, /copyRelativePath:/, 'zh must define copyRelativePath')
    assert.doesNotMatch(en, /copyPath:/, 'en must drop the legacy copyPath key')
    assert.doesNotMatch(zh, /copyPath:/, 'zh must drop the legacy copyPath key')
})
