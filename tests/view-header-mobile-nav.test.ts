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

test('mobile main pages open the sidebar drawer via a hamburger instead of back arrow', () => {
    // isMainPage 顶栏移动端渲染汉堡（lg:hidden），桌面端保持无键；
    // label for= 跨 DOM 生效，指向 MobileLayout 挂载的全局抽屉节点。
    // lg:hidden 是硬约束：桌面布局无 sidebar-drawer 输入节点，可见即死键
    assert.match(
        viewHeaderSource,
        /<div v-if="isMainPage" class="flex-none lg:hidden">\s*\n\s*<label for="sidebar-drawer"/,
        'main-page hamburger must be mobile-only (lg:hidden) and target the shared drawer',
    )
    assert.match(
        viewHeaderSource,
        /:aria-label="\$t\('common\.openSidebar'\)"/,
        'the hamburger label needs an accessible name',
    )
    // 非主页面（子页）仍保留返回箭头
    assert.match(
        viewHeaderSource,
        /ArrowLeftIcon/,
        'sub pages keep the back arrow',
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
