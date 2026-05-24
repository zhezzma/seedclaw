import test from 'node:test'
import assert from 'node:assert/strict'
import { useWorkspaceViewer } from '../src/composables/useWorkspaceViewer.ts'

test.beforeEach(() => {
    useWorkspaceViewer().close()
})

test('默认无 current', () => {
    const v = useWorkspaceViewer()
    assert.equal(v.current.value, null)
    assert.equal(v.isActive.value, false)
})

test('openFile 设置 current.type=file', () => {
    const v = useWorkspaceViewer()
    v.openFile('/abs/path/file.ts')
    assert.deepEqual(v.current.value, { type: 'file', path: '/abs/path/file.ts' })
    assert.equal(v.isActive.value, true)
})

test('openDiff 设置 current.type=diff', () => {
    const v = useWorkspaceViewer()
    v.openDiff({ repo: 'r', mode: 'unstaged', file: 'a.ts' })
    assert.deepEqual(v.current.value, { type: 'diff', repo: 'r', mode: 'unstaged', file: 'a.ts', ref: undefined })
})

test('openAgentFile 设置 current.type=agent-file', () => {
    const v = useWorkspaceViewer()
    v.openAgentFile('AGENTS.md')
    assert.deepEqual(v.current.value, { type: 'agent-file', path: 'AGENTS.md' })
    assert.equal(v.isActive.value, true)
})

test('close 清空', () => {
    const v = useWorkspaceViewer()
    v.openFile('/a')
    v.close()
    assert.equal(v.current.value, null)
})

test('viewer.close() 不再触发 git status 重拉（spec: 仅保存/mutation 才刷新）', async () => {
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    ;(git as any).statusRepo = 'repoX'
    ;(git as any).statusData = { branch: 'main', upstream: null, head: 'h', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }

    const v = useWorkspaceViewer()
    v.openFile('/x')
    v.close()

    // 新契约：close 不动 git store。刷新由 WorkspaceFileView.save / stage / unstage / discard / commit 负责。
    assert.equal(git.statusRepo, 'repoX')
    assert.notEqual(git.status.value, null)
})

test('setDirty/dirty: 默认 null，setDirty 写入后可读、close 会清除', () => {
    const v = useWorkspaceViewer()
    assert.equal(v.dirty.value, null)
    v.setDirty('src/a.ts')
    assert.deepEqual(v.dirty.value, { path: 'src/a.ts' })
    v.openFile('src/a.ts')
    // 打开后 dirty 不变，仅 close() 才会重置
    assert.deepEqual(v.dirty.value, { path: 'src/a.ts' })
    v.close()
    assert.equal(v.dirty.value, null)
})

test('setDirty(null) 是明确重置', () => {
    const v = useWorkspaceViewer()
    v.setDirty('a')
    v.setDirty(null)
    assert.equal(v.dirty.value, null)
})
