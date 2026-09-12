/**
 * 行为级回归测试：会话行双实例身份一致性（esbuild 打包真实 useChatState 驱动）。
 *
 * 背景：同一 session 在前端缓存里存在多个行对象实例 —— 列表行（useSessionsState
 * 三个桶，侧边栏读取源）与聊天页标签读取源。历史上 upsertSessionByRouteState 会
 * 为索引与桶各创建一个新对象（双重展开），导致标签源与列表行从会话打开起就是两个
 * 对象；任何只写单侧的写入方都会复现"切换/改名看起来没生效、刷新页面才恢复"。
 *
 * 本测试把真实 useChatState/useSessionsState 用 esbuild 打包进 Node 可执行 bundle
 * （stub 掉 tauri/router/i18n），驱动"打开会话 → 连续两次切换模型"，断言：
 *   1. 标签源与列表行是同一实例（IDENTITY SAME）；
 *   2. 两次切换的乐观写入都即时反映在标签源与列表行上；
 *   3. 两次 POST /model 都真实发出；
 *   4. 服务端按新模型重推导的 thinkingLevel 必须落行（模型切换即同步思考档位）。
 * 另有冷启动场景：行尚未入桶（/info 在途）时切换，行落桶后确认值仍必须到达。
 * 源码结构钉（同目录其他 test）只能钉"写了哪些行"，钉不住"写进了哪个实例"——
 * 只有行为测试能守住该 bug 类。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(testDir, '..')

const srcPath = (p: string) => join(repoRoot, p).replace(/\\/g, '/')

const STUBS: Record<string, string> = {
    tauri: 'export const invoke = async () => ({}); export const listen = async () => () => {}; export default {};',
    i18n: 'export const i18n = { global: { t: (k: string) => k, te: () => true, locale: { value: "zh" } }, t: (k: string) => k }; export default i18n;',
    router: 'const router = { push: async () => {}, replace: async () => {}, afterEach: () => {} }; export default router;',
    'notify-client': 'export const connectBrowserWs = async () => {}; export const disconnectBrowserWs = () => {}; export const getWsUrl = () => ""; export const sendBrowserWs = async () => false;',
}

function stubPluginForTest() {
    return {
        name: 'seedclaw-test-stubs',
        setup(b: any) {
            b.onResolve({ filter: /^@tauri-apps\// }, (a: any) => ({ path: a.path, namespace: 'stub' }))
            b.onResolve({ filter: /\/i18n$/ }, (a: any) => ({ path: a.path, namespace: 'stub' }))
            b.onResolve({ filter: /\/router$/ }, (a: any) => ({ path: a.path, namespace: 'stub' }))
            b.onResolve({ filter: /notify-client$/ }, (a: any) => ({ path: a.path, namespace: 'stub' }))
            b.onLoad({ filter: /.*/, namespace: 'stub' }, (args: any) => {
                const key = args.path.startsWith('@tauri-apps')
                    ? 'tauri'
                    : args.path.endsWith('/i18n') ? 'i18n'
                    : args.path.endsWith('/router') ? 'router'
                    : args.path.endsWith('notify-client') ? 'notify-client'
                    : 'tauri'
                return { contents: STUBS[key], loader: 'ts', resolveDir: testDir }
            })
        },
    }
}

const harnessEntry = `
;(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
try { (globalThis as any).window = { matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) } } catch {}
;(globalThis as any).document = { createElement: () => ({ style: {} }), addEventListener: () => {}, removeEventListener: () => {} }

import { createPinia, setActivePinia } from 'pinia'
import { toRaw } from 'vue'
setActivePinia(createPinia())

const INFO_DELAY_MS = Number(process.env.HARNESS_INFO_DELAY_MS || 0)
const calls = []
;(globalThis as any).fetch = async (url, init) => {
    const u = new URL(url)
    let reqBody
    try { reqBody = init?.body ? JSON.parse(init.body) : undefined } catch { reqBody = undefined }
    calls.push((init?.method || 'GET') + ' ' + u.pathname)
    const body = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
    if (u.pathname === '/api/sessions') return body({ ok: true, payload: { sessions: [{ id: 'S1', name: 'S1', modelProvider: 'p0', model: 'm0', thinkingLevel: 'off' }] } })
    if (u.pathname === '/api/sessions/S1/info') return body({ ok: true, payload: { id: 'S1', name: 'S1', modelProvider: 'p0', model: 'm0', thinkingLevel: 'off' } })
    if (u.pathname === '/api/sessions/S2/info') return new Promise((resolve) => {
        setTimeout(() => resolve(body({ ok: true, payload: { id: 'S2', name: 'S2', modelProvider: 'p0', model: 'm0', thinkingLevel: 'off' } })), INFO_DELAY_MS)
    })
    if (u.pathname.endsWith('/model')) {
        if (process.env.HARNESS_ALL_FAIL === '1') return body({ ok: false, error: 'network blip' }, 500)
        return body({ ok: true, payload: { provider: reqBody?.provider ?? 'pA', model: reqBody?.model ?? 'mNew', thinkingLevel: 'high' } })
    }
    if (u.pathname.endsWith('/thinking-level')) return body({ ok: true, payload: { thinkingLevel: 'high' } })
    if (u.pathname.endsWith('/messages')) return body({ ok: true, payload: { messages: [], isStreaming: false } })
    if (u.pathname.endsWith('/attach')) return body({ ok: true, payload: {} })
    return body({ ok: true, payload: {} })
}

const { useChatState } = await import('${srcPath('src/composables/useChatState.ts')}')
const { useSessionsState } = await import('${srcPath('src/composables/useSessionsState.ts')}')
const { useUiSettingsStore } = await import('${srcPath('src/stores/setting.ts')}')
;(useUiSettingsStore() as any).apiBaseUrl = 'http://mock-api'

const chat = useChatState() as any
const sessions = useSessionsState() as any

const identity = () => {
    const c = chat.currentSession
    const l = sessions.findSessionLocal('S1')
    if (!c || !l) return 'MISSING'
    return toRaw(c) === toRaw(l) ? 'SAME' : 'DIFF'
}

await chat.setSessionKey('S1')
console.log('IDENTITY after-setSessionKey ' + identity())
console.log('STATE after-setSessionKey C=' + (chat.currentSession?.model ?? 'null') + '/' + (chat.currentSession?.modelProvider ?? 'null') + ' LIST=' + (sessions.findSessionLocal('S1')?.model ?? 'null'))

const ok1 = await chat.setSessionModel('pA/m1')
console.log('SWITCH1 ok=' + ok1 + ' C=' + chat.currentSession?.model + '/' + chat.currentSession?.modelProvider + ' LIST=' + sessions.findSessionLocal('S1')?.model + ' THINK=' + chat.currentSession?.thinkingLevel + '/' + sessions.findSessionLocal('S1')?.thinkingLevel)

const ok2 = await chat.setSessionModel('pA/m2')
console.log('SWITCH2 ok=' + ok2 + ' C=' + chat.currentSession?.model + '/' + chat.currentSession?.modelProvider + ' LIST=' + sessions.findSessionLocal('S1')?.model + ' THINK=' + chat.currentSession?.thinkingLevel + '/' + sessions.findSessionLocal('S1')?.thinkingLevel)

console.log('POSTS ' + calls.filter((c) => c.includes('/model')).length)

// 场景3：重叠双选且全部失败——settle 必须回滚到真正的服务端值（M0），
// 而不是第二个 flight 从第一个 flight 的未确认乐观值上补拍出的基准（A）
if (process.env.HARNESS_ALL_FAIL === '1') {
    // 并发重叠：两个 flight 同时在途（串行 await 会让第一个先 settle，毒化不发生）
    await Promise.all([chat.setSessionModel('pA/m1'), chat.setSessionModel('pA/m2')])
    console.log('ALLFAIL C=' + chat.currentSession?.model + ' LIST=' + sessions.findSessionLocal('S1')?.model)
}

// 场景2：冷启动窗口——/info 在途、行尚未入桶时用户就切换模型
if (process.env.HARNESS_COLD_START === '1') {
    chat.setSessionKey('S2') // 不 await：sessionKey 已置，S2 的 /info 在途、行未入桶
    await new Promise((r) => setTimeout(r, 5))
    const coldOk = await chat.setSessionModel('pA/m2')
    await new Promise((r) => setTimeout(r, INFO_DELAY_MS + 80))
    console.log('COLD ok=' + coldOk + ' C=' + chat.currentSession?.model + ' LIST=' + sessions.findSessionLocal('S2')?.model + ' THINK=' + chat.currentSession?.thinkingLevel)
}
`

async function runHarness(outDir: string, env: Record<string, string>): Promise<string> {
    await mkdir(outDir, { recursive: true })
    const entryPath = join(outDir, 'harness-entry.ts')
    await writeFile(entryPath, harnessEntry, 'utf8')
    await build({
        entryPoints: [entryPath],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: join(outDir, 'harness.mjs'),
        external: ['vue', 'pinia'],
        logLevel: 'silent',
        plugins: [stubPluginForTest()],
    })
    // 产物必须落在仓库内（node_modules 下），否则 external 的 vue/pinia 从 Temp 解析不到
    const proc = spawnSync(process.execPath, [join(outDir, 'harness.mjs')], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, ...env },
    })
    const out = proc.stdout || ''
    if (proc.status !== 0) {
        throw new Error(`harness exited ${proc.status}\nstdout: ${out}\nstderr: ${proc.stderr}`)
    }
    return out
}

test('session row instances stay identical across open + consecutive model switches (behavior)', async () => {
    const outDir = join(repoRoot, 'node_modules/.cache/seedclaw-row-harness')
    try {
        const out = await runHarness(outDir, {})

        // 1) 标签源必须与列表行同一实例（分叉即回归）
        assert.match(out, /IDENTITY after-setSessionKey SAME/, 'currentSession must be the SAME instance as the sidebar list row')
        // 2) 两次切换都必须同时反映在标签源与列表行上
        assert.match(out, /SWITCH1 ok=true C=m1\/pA LIST=m1/, 'first switch should update both the label source and the list row')
        assert.match(out, /SWITCH2 ok=true C=m2\/pA LIST=m2/, 'second switch must also update both instances (the reported bug: only the first took effect)')
        // 3) 服务端按新模型重推导的 thinkingLevel（mock 恒回 high，行初值 off）必须落到两端标签
        assert.match(out, /SWITCH1 .*THINK=high\/high/, 'model switch must backfill the server-re-derived thinkingLevel to both instances')
        // 4) 两次请求都真实发出
        assert.match(out, /POSTS 2/, 'both switches should hit the dedicated endpoint')
    } finally {
        await rm(outDir, { recursive: true, force: true })
    }
})

test('all-fail overlapping double-select rolls back to the true server value (behavior)', async () => {
    const outDir = join(repoRoot, 'node_modules/.cache/seedclaw-row-harness-allfail')
    try {
        const out = await runHarness(outDir, { HARNESS_ALL_FAIL: '1' })
        assert.match(
            out,
            /ALLFAIL C=m0 LIST=m0/,
            'when every overlapping switch fails, the label must roll back to the last server-confirmed value (not an unconfirmed optimistic value)',
        )
    } finally {
        await rm(outDir, { recursive: true, force: true })
    }
})

test('cold-start switch lands on the row once it materializes (behavior)', async () => {
    const outDir = join(repoRoot, 'node_modules/.cache/seedclaw-row-harness-cold')
    try {
        const out = await runHarness(outDir, { HARNESS_COLD_START: '1', HARNESS_INFO_DELAY_MS: '60' })
        assert.match(
            out,
            /COLD ok=true C=m2 LIST=m2 THINK=high/,
            'a switch fired before the row existed must still land once the row materializes (the server accepted it)',
        )
    } finally {
        await rm(outDir, { recursive: true, force: true })
    }
})
