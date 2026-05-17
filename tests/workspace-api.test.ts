import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useUiSettingsStore } from '../src/stores/setting.ts'
import * as api from '../src/composables/workspace-api.ts'

const originalFetch = globalThis.fetch
const originalLocalStorage = globalThis.localStorage

test.beforeEach(() => {
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
    setActivePinia(createPinia())
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost:8088'
    settings.token = 'tk'
})

test.afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage })
})

test('fetchTree 拼对路径与查询参数', async () => {
    let captured: { url: string, init?: RequestInit } | null = null
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        captured = { url, init }
        return new Response(JSON.stringify({ ok: true, payload: { root: '/ws', path: 'src', entries: [] } }), {
            status: 200, headers: { 'content-type': 'application/json' },
        })
    }) as any

    const r = await api.fetchTree('coder', 'src')
    assert.equal(r.path, 'src')
    assert.match(captured!.url, /\/api\/agents\/coder\/workspace\/tree\?path=src$/)
})

test('fetchTree 空 path 不带参数', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({ ok: true, payload: { root: '/ws', path: '', entries: [] } }), { status: 200 })
    }) as any
    await api.fetchTree('coder', '')
    assert.match(captured, /\/workspace\/tree$/)
})

test('fetchDiff: untracked 模式仅传 file', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({ ok: true, payload: { mode: 'untracked', file: 'a', binary: false, truncated: false, diff: '' } }), { status: 200 })
    }) as any
    await api.fetchDiff('coder', { repo: 'r', mode: 'untracked', file: 'a' })
    assert.match(captured, /mode=untracked/)
    assert.match(captured, /file=a/)
})

test('fetchDiff: commit 模式带 ref', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({ ok: true, payload: { mode: 'commit', file: 'a', binary: false, truncated: false, diff: '' } }), { status: 200 })
    }) as any
    await api.fetchDiff('coder', { repo: 'r', mode: 'commit', ref: 'abc123', file: 'a' })
    assert.match(captured, /ref=abc123/)
})

test('fetchCommitFiles 拼对路径', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({ ok: true, payload: { ref: 'sha', files: [] } }), { status: 200 })
    }) as any
    await api.fetchCommitFiles('coder', 'r', 'sha')
    assert.match(captured, /\/repo\/commit\/files\?repo=r&ref=sha/)
})

test('fetchFile 拼 agent-scoped path', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({
            ok: true,
            payload: { path: 'src/a.ts', binary: false, truncated: false, content: 'hello' },
        }), { status: 200 })
    }) as any
    const r = await api.fetchFile('coder', 'src/a.ts')
    assert.equal(r.content, 'hello')
    assert.match(captured, /\/api\/agents\/coder\/workspace\/file\?path=src%2Fa\.ts$/)
})

test('saveFile 发 PUT 带 JSON body', async () => {
    let captured: { url: string, init?: RequestInit } | null = null
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        captured = { url, init }
        return new Response(JSON.stringify({ ok: true, payload: { path: 'src/a.ts', bytes: 5 } }), { status: 200 })
    }) as any
    const r = await api.saveFile('coder', 'src/a.ts', 'hello')
    assert.equal(r.bytes, 5)
    assert.equal(captured!.init!.method, 'PUT')
    assert.match(String((captured!.init!.headers as any)['content-type']), /application\/json/)
    assert.equal(captured!.init!.body, JSON.stringify({ content: 'hello' }))
    assert.match(captured!.url, /\/api\/agents\/coder\/workspace\/file\?path=src%2Fa\.ts$/)
})

test('saveFile HTTP 错误抛出 WorkspaceApiError', async () => {
    globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ ok: false, error: 'File not found' }), { status: 404 })
    }) as any
    await assert.rejects(
        () => api.saveFile('coder', 'nope', 'x'),
        (err: any) => /File not found/.test(err.message),
    )
})

test('fetchFileVersions: untracked 仅传 file', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({
            ok: true,
            payload: { mode: 'untracked', file: 'a', binary: false, truncated: false, before: null, after: 'x' },
        }), { status: 200 })
    }) as any
    const r = await api.fetchFileVersions('coder', { repo: 'r', mode: 'untracked', file: 'a' })
    assert.equal(r.before, null)
    assert.equal(r.after, 'x')
    assert.match(captured, /\/repo\/file-versions\?/)
    assert.match(captured, /mode=untracked/)
    assert.match(captured, /file=a/)
})

test('fetchFileVersions: commit 模式带 ref', async () => {
    let captured = ''
    globalThis.fetch = (async (url: string) => {
        captured = url
        return new Response(JSON.stringify({
            ok: true,
            payload: { mode: 'commit', file: 'a', binary: false, truncated: false, before: '1', after: '2' },
        }), { status: 200 })
    }) as any
    await api.fetchFileVersions('coder', { repo: 'r', mode: 'commit', ref: 'abc123', file: 'a' })
    assert.match(captured, /ref=abc123/)
})
