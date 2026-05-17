import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

const originalFetch = globalThis.fetch
const originalLocalStorage = globalThis.localStorage

function setupStorage() {
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => storage.get(k) ?? null,
            setItem: (k: string, v: string) => { storage.set(k, v) },
            removeItem: (k: string) => { storage.delete(k) },
            clear: () => storage.clear(),
            key: () => null,
            length: 0,
        },
    })
}

function mockRoutes(routes: Record<string, () => unknown>) {
    globalThis.fetch = (async (url: string) => {
        for (const pattern in routes) {
            if (url.includes(pattern)) {
                return new Response(JSON.stringify({ ok: true, payload: routes[pattern]() }), { status: 200 })
            }
        }
        return new Response(JSON.stringify({ ok: false, error: 'not mocked: ' + url }), { status: 500 })
    }) as any
}

async function setupSettings() {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'
}

test.beforeEach(() => {
    setupStorage()
    setActivePinia(createPinia())
})

test.afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage })
})

test('loadRepos 拉仓库列表', async () => {
    await setupSettings()
    mockRoutes({
        '/workspace/repos': () => ({ repos: [
            { name: 'r1', path: 'r1', branch: 'main', head: 'abc', dirty: 0, ahead: 0, behind: 0 },
        ]}),
    })
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    await git.loadRepos('coder')
    assert.equal(git.repos.value.length, 1)
})

test('loadStatus 拉某仓库 status', async () => {
    await setupSettings()
    mockRoutes({
        '/workspace/repo/status': () => ({
            branch: 'main', upstream: null, head: 'abc', ahead: 0, behind: 0,
            staged: [{ path: 'a.ts', status: 'M' }],
            unstaged: [],
            untracked: [],
        }),
    })
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    await git.loadStatus('coder', 'r1')
    assert.equal(git.status.value?.staged.length, 1)
})

test('loadLog 与 loadMoreLog 翻页累加', async () => {
    await setupSettings()
    let call = 0
    mockRoutes({
        '/workspace/repo/log': () => {
            call++
            // 第一页返回满 50 条 → hasMore=true；第二页返回 1 条
            const count = call === 1 ? 50 : 1
            return {
                commits: Array.from({ length: count }, (_, i) => ({
                    sha: `sha${call}-${i}`,
                    shortSha: `s${call}-${i}`,
                    author: 'a',
                    authorDate: 'd',
                    subject: `commit ${call}-${i}`,
                })),
            }
        },
    })
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    await git.loadLog('coder', 'r1')
    assert.equal(git.commits.value.length, 50)
    await git.loadMoreLog('coder', 'r1')
    assert.equal(git.commits.value.length, 51)
})

test('loadCommitFiles 缓存到 commitFiles map', async () => {
    await setupSettings()
    mockRoutes({
        '/repo/commit/files': () => ({ ref: 'sha', files: [{ path: 'a.ts', status: 'M' }] }),
    })
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    await git.loadCommitFiles('coder', 'r1', 'sha')
    assert.equal(git.commitFiles.value['sha']?.length, 1)
})

test('reset 清空所有状态', async () => {
    await setupSettings()
    mockRoutes({ '/workspace/repos': () => ({ repos: [{ name: 'r', path: 'r', branch: 'm', head: null, dirty: 0, ahead: 0, behind: 0 }] }) })
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    await git.loadRepos('coder')
    git.reset()
    assert.equal(git.repos.value.length, 0)
    assert.equal(git.status.value, null)
})

test('getter 名与 state 字段名不冲突（防止 Object.assign 覆盖成 truthy字典）', async () => {
    // 这个回归针对浏览器实测中发现的 P0：
    // _methods 里 `reposLoading: { get value() {...} }` 如果与 state 中 `reposLoading: false`
    // 同名，Object.assign 会用 getter 对象覆盖 boolean，导致 git.reposLoading.value 返回
    // 的其实是 getter 对象本身（冗余结构）、且在 onMounted 检查中 `!git.reposLoading.value`
    // 永远为 false，造成首次 loadRepos 不触发。
    // 这里验证：loadRepos 过程中 reposLoading 是真的 boolean，不是 getter 对象。
    await setupSettings()
    let resolveLoad: ((v: any) => void) | null = null
    globalThis.fetch = (async (url: string) => {
        if (url.includes('/workspace/repos')) {
            return new Promise(resolve => { resolveLoad = resolve })
        }
        return new Response('', { status: 500 })
    }) as any
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()

    // 初始：未加载
    assert.equal(typeof git.reposLoading.value, 'boolean', 'reposLoading.value 必须是 boolean')
    assert.equal(git.reposLoading.value, false)
    assert.equal(typeof git.reposError.value, 'object') // null 是 object，但赋值后是 string

    // 进行中：loading 必须是 true、不是 getter 对象
    const promise = git.loadRepos('coder')
    assert.equal(typeof git.reposLoading.value, 'boolean')
    assert.equal(git.reposLoading.value, true, 'loadRepos 中 reposLoading 应为 true')

    // 完成后回到 false
    resolveLoad!(new Response(JSON.stringify({ ok: true, payload: { repos: [] } }), { status: 200 }))
    await promise
    assert.equal(typeof git.reposLoading.value, 'boolean')
    assert.equal(git.reposLoading.value, false)

    // 同样验证其它几个可能冲突的字段
    assert.equal(typeof git.statusLoading.value, 'boolean')
    assert.equal(typeof git.commitsLoading.value, 'boolean')
    assert.equal(typeof git.commitsHasMore.value, 'boolean')
})

test('reset 后跸 agent 旧 in-flight 请求被丢弃（epoch 防护）', async () => {
    await setupSettings()
    let resolveOldRepos: ((v: any) => void) | null = null
    let callCount = 0
    globalThis.fetch = (async (url: string) => {
        if (url.includes('/workspace/repos')) {
            callCount++
            if (callCount === 1) {
                // 第一次调用（agent A）挂起不 resolve，模拟慢请求
                return new Promise(resolve => { resolveOldRepos = resolve })
            }
            // 第二次调用（agent B）立即返回新数据
            return new Response(JSON.stringify({
                ok: true,
                payload: { repos: [{ name: 'B-repo', path: 'B-repo', branch: 'main', head: null, dirty: 0, ahead: 0, behind: 0 }] },
            }), { status: 200 })
        }
        return new Response('', { status: 500 })
    }) as any

    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()

    // 1) agent A 发起 loadRepos，挂起
    const oldLoad = git.loadRepos('agentA')
    // 2) reset 模拟 agent 切换
    git.reset()
    // 3) agent B 发起 loadRepos，立即完成
    await git.loadRepos('agentB')
    assert.equal(git.repos.value.length, 1)
    assert.equal(git.repos.value[0].name, 'B-repo')

    // 4) 现在 resolve agent A 的旧响应
    resolveOldRepos!(new Response(JSON.stringify({
        ok: true,
        payload: { repos: [{ name: 'A-repo', path: 'A-repo', branch: 'main', head: null, dirty: 0, ahead: 0, behind: 0 }] },
    }), { status: 200 }))
    await oldLoad

    // 验证：B 的数据未被 A 的迟到响应覆盖
    assert.equal(git.repos.value.length, 1)
    assert.equal(git.repos.value[0].name, 'B-repo')
})

test('markStatusStale 重置 statusRepo 为 null（viewer 关闭后让下次 onMounted 重拉）', async () => {
    await setupSettings()
    mockRoutes({
        '/workspace/repo/status': () => ({
            branch: 'main', upstream: null, head: 'abc', ahead: 0, behind: 0,
            staged: [], unstaged: [], untracked: [],
        }),
    })
    const { useWorkspaceGit } = await import('../src/composables/useWorkspaceGit.ts')
    const git = useWorkspaceGit()
    git.reset()
    await git.loadStatus('coder', 'r1')
    assert.equal(git.statusRepo, 'r1')
    git.markStatusStale()
    assert.equal(git.statusRepo, null)
})
