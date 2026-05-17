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

test('close 清空', () => {
    const v = useWorkspaceViewer()
    v.openFile('/a')
    v.close()
    assert.equal(v.current.value, null)
})

test('close 后 git 的 statusRepo 与 statusData 被同时清空（避免 UI 闪现陈旧数据）', async () => {
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    // 手动设上 status 模拟“已加载”
    ;(git as any).statusRepo = 'repoX'
    ;(git as any).statusData = { branch: 'main', upstream: null, head: 'h', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [] }
    assert.equal(git.statusRepo, 'repoX')
    assert.notEqual(git.status.value, null)

    const v = useWorkspaceViewer()
    v.openFile('/x')
    v.close()

    assert.equal(git.statusRepo, null)
    assert.equal(git.status.value, null)
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
