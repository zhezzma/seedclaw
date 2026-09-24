import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

const viewHeaderSource = read('src/components/ViewHeader.vue')
const mobileLayoutSource = read('src/layouts/MobileLayout.vue')
const homeViewSource = read('src/views/HomeView.vue')
const zhSource = read('src/i18n/zh.ts')
const enSource = read('src/i18n/en.ts')

test('ViewHeader goBack falls back to home when there is no in-app history', () => {
    // 深链直达/重启落地时 history.state.back 为空，router.back() 会空转甚至退出 webview；
    // 兜底回首页（home 会 redirect 到 chat/new），语义与 AgentsView.clearSelection 一致
    assert.match(
        viewHeaderSource,
        /history\.state[\s\S]{0,80}?\.back/,
        'goBack should inspect history.state.back before calling router.back()',
    )
    assert.match(
        viewHeaderSource,
        /router\.replace\(\{\s*name:\s*'home'/,
        'goBack should fall back to the home route when no back entry exists',
    )
})

test('mobile main pages keep the back arrow (drawer hamburger is home-only)', () => {
    // isMainPage 顶栏保留返回箭头：移动端可见（返回主页/上一页），桌面端 lg:hidden；
    // 开侧栏抽屉的汉堡只归主页 ChatHeader 所有，ViewHeader 不得再渲染抽屉入口
    assert.match(
        viewHeaderSource,
        /:class="\{\s*'lg:hidden':\s*isMainPage\s*\}"/,
        'main-page back arrow must stay mobile-only (lg:hidden binds isMainPage)',
    )
    assert.match(
        viewHeaderSource,
        /ArrowLeftIcon/,
        'both main and sub pages render the back arrow',
    )
    assert.doesNotMatch(
        viewHeaderSource,
        /sidebar-drawer/,
        'ViewHeader must not open the drawer; ChatHeader (home) owns the hamburger',
    )
})

test('sidebar drawer node lives exactly once, in MobileLayout', () => {
    assert.match(
        mobileLayoutSource,
        /id="sidebar-drawer"/,
        'MobileLayout should host the global mobile sidebar drawer',
    )
    assert.match(
        mobileLayoutSource,
        /AppSidebar/,
        'MobileLayout drawer should render AppSidebar',
    )
    assert.match(
        mobileLayoutSource,
        /:aria-label="\$t\('common\.closeSidebar'\)"/,
        'drawer overlay label should be localized',
    )
    assert.doesNotMatch(
        homeViewSource,
        /sidebar-drawer/,
        'HomeView must no longer mount its own drawer copy (would shadow the layout node)',
    )
    assert.doesNotMatch(
        homeViewSource,
        /import AppSidebar/,
        'HomeView no longer renders AppSidebar directly, the orphan import must go',
    )
})

test('drawer label keys exist in both locales', () => {
    const zhCommon = zhSource.match(/common:\s*\{([\s\S]*?)\n    \},/)?.[1] ?? ''
    const enCommon = enSource.match(/common:\s*\{([\s\S]*?)\n    \},/)?.[1] ?? ''
    for (const [name, block] of [['zh', zhCommon], ['en', enCommon]] as const) {
        for (const key of ['openSidebar', 'closeSidebar']) {
            assert.match(
                block,
                new RegExp(`${key}:\\s*['"][^'"]+['"]`),
                `${name}.ts common should define ${key}`,
            )
        }
    }
})
