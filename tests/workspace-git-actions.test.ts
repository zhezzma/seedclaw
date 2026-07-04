import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
function read(rel: string): string {
    return readFileSync(path.resolve(dir, '..', rel), 'utf8')
}

const src = read('src/composables/useGitFileActions.ts')

test('useGitFileActions: 不跨模块 import composable（HMR-safe）', () => {
    // 与 useFileActions 同样的 HMR-safe 模式：所有 mutation 走调用者透入的 callback
    assert.doesNotMatch(src, /from\s+['"]\.\/useWorkspaceGit['"]/, 'must NOT import useWorkspaceGit')
    assert.doesNotMatch(src, /from\s+['"]\.\/useWorkspaceTree['"]/, 'must NOT import useWorkspaceTree')
})

test('useGitFileActions: stage / unstage / discard 按 group 分配可见性', () => {
    // staged 行只显示 unstage；unstaged + untracked 行显示 stage + discard
    assert.match(src, /group !== 'staged' && onStage/, 'stage hidden on staged group')
    assert.match(src, /group === 'staged' && onUnstage/, 'unstage only on staged group')
    assert.match(src, /group !== 'staged' && onDiscard/, 'discard hidden on staged group')
})

test('useGitFileActions: discard 单文件必弹 confirm（VSCode 风格）', () => {
    // 用户确认前不能调 onDiscard
    assert.match(src, /useConfirm/, 'must use useConfirm for destructive ops')
    assert.match(
        src,
        /const ok = await confirm\([\s\S]*?if \(!ok\) return\s*[\s\S]*?onDiscard\(\)/,
        'discard must require explicit user confirmation BEFORE calling onDiscard',
    )
    // untracked 要单独的文案（提示是删除文件，不是还原）
    assert.match(src, /discardUntrackedConfirm/, 'must use distinct copy for untracked vs tracked discard')
})

test('useGitFileActions: runDiscardAllFlow 全部丢弃也必弹 confirm', () => {
    assert.match(src, /export async function runDiscardAllFlow/, 'must export runDiscardAllFlow')
    assert.match(
        src,
        /const ok = await confirm\([\s\S]*?if \(!ok\) return\s*[\s\S]*?onConfirmed\(\)/,
        'discardAll must confirm before mutating',
    )
    // 合并 unstaged + untracked 后只保留一条文案 key。服务端逐文件判别 tracked / untracked
    // 走不同逻辑，不需要前端提示分点。
    assert.match(src, /discardAllConfirm/, 'must use the generic discardAllConfirm copy')
})

test('useGitFileActions: 错误必 toast，不静默吞', () => {
    // 至少 4 处 catch + toast.error
    const matches = src.match(/catch \(e: any\)\s*\{\s*toast\.error/g) || []
    assert.ok(matches.length >= 4, `expected >=4 catch+toast pairs, got ${matches.length}`)
})

test('useGitFileActions: 菜单包含 Open File，且 deleted 状态禁用', () => {
    // 右键菜单顺序（VSCode）：Open File -> Open Changes -> Stage/Unstage -> Discard
    assert.match(src, /workspace\.menu\.openFile/, 'menu must include Open File')
    // deleted 状态：disabled = isOpenFileDisabled(file)，由 file.status === 'D' 判定
    assert.match(src, /file\.status === 'D'/, 'must disable Open File when status is D (deleted)')
})

test('useGitFileActions: buildGitInlineActions 提供行内按钮配置', () => {
    assert.match(src, /export function buildGitInlineActions/, 'must export buildGitInlineActions')
    assert.match(src, /InlineAction/, 'must define InlineAction shape')
    // VSCode 行内顺序：Open File · Discard · Stage（unstaged/untracked）
    // 或：Open File · Unstage（staged）。Discard 走 confirm（与右键菜单同 callback）。
    assert.match(src, /workspace\.menu\.openFile/, 'inline must surface openFile')
    assert.match(src, /workspace\.git\.discard/, 'inline must surface discard for unstaged/untracked')
    assert.match(src, /workspace\.git\.stage/, 'inline must surface stage for unstaged/untracked')
    assert.match(src, /workspace\.git\.unstage/, 'inline must surface unstage for staged')
})

test('useGitFileActions: buildGitFileMenu 通用工厂产出 打开文件/打开diff/复制路径', () => {
    // 三处 git 文件行（工作区/暂存区/提交历史文件）共用的核心菜单项。
    assert.match(src, /export function buildGitFileMenu/, 'must export buildGitFileMenu')
    // 顺序：打开文件 → 打开 diff → 复制路径（与 VSCode git 行右键一致）
    assert.match(src, /workspace\.menu\.openFile[\s\S]*?workspace\.git\.openChanges[\s\S]*?workspace\.menu\.copyAbsolutePath/, 'order must be openFile → openChanges → copyAbsolutePath')
    // 复制路径写调用方拼好的绝对路径，工厂统一处理 clipboard + toast
    assert.match(src, /writeClipboard\(absolutePath\)/, 'copy action must write caller-provided absolutePath')
    assert.match(src, /toast\.success\(tr\('workspace\.menu\.copied'\)\)/, 'copy success must toast workspace.menu.copied')
    // 打开文件可禁用（deleted 等），由调用方传 openFileDisabled
    assert.match(src, /disabled: openFileDisabled/, 'openFile must honor openFileDisabled')
})
