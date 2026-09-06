import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sidebarSource = readFileSync(path.join(root, 'src/components/AppSidebar.vue'), 'utf8')

test('sidebar defines three session tabs with daisyUI tabs-boxed styling', () => {
    assert.match(sidebarSource, /export type SidebarSessionTab = 'chats' \| 'plans' \| 'archived'/)
    assert.match(sidebarSource, /tabs tabs-boxed/)
    assert.match(sidebarSource, /:class="\{ 'tab-active': sessionTab === 'chats' \}"/)
    assert.match(sidebarSource, /:class="\{ 'tab-active': sessionTab === 'plans' \}"/)
    assert.match(sidebarSource, /:class="\{ 'tab-active': sessionTab === 'archived' \}"/)
    // 每个 tab 都有可访问性选中态
    assert.match(sidebarSource, /:aria-selected="sessionTab === 'chats'"/)
    assert.match(sidebarSource, /:aria-selected="sessionTab === 'plans'"/)
    assert.match(sidebarSource, /:aria-selected="sessionTab === 'archived'"/)
})

test('sidebar tab switch lazily loads the matching data bucket and retries on failure', () => {
    // plans/archived 懒加载；chats 依赖启动链 useAppInit，不进 TAB_LOADERS
    assert.match(sidebarSource, /plans: \(\) => sessionsState\.loadTaskSessions\(\)/)
    assert.match(sidebarSource, /archived: \(\) => sessionsState\.loadArchivedSessions\(\)/)
    assert.doesNotMatch(sidebarSource, /chats: \(\) => sessionsState\.loadSessions\(\)/)
    // 初始无标记，懒加载语义
    assert.match(sidebarSource, /const loadedTabs = new Set<SidebarSessionTab>\(\)/)
    // loader 失败返回 null 时移除标记，下次切到该 tab 会重试
    assert.match(sidebarSource, /if \(await loader\(\) == null\) \{\s*loadedTabs\.delete\(tab\)/)
    // loader 违约 reject 时同样释放标记（catch 分支），不允许永久卡死
    assert.match(sidebarSource, /\} catch \{[\s\S]*?loadedTabs\.delete\(tab\)/)
})

test('sidebar tab loading state is per-tab, safe under concurrent tab switches', () => {
    // 在途集合按 tab 粒度，spinner 只跟随当前显示 tab；
    // 并发切换时先完成的 loader 不会把仍在途 tab 的 spinner 提前关掉
    assert.match(sidebarSource, /const loadingTabs = reactive\(new Set<SidebarSessionTab>\(\)\)/)
    assert.match(sidebarSource, /const tabLoading = computed\(\(\) => loadingTabs\.has\(sessionTab\.value\)\)/)
    assert.match(sidebarSource, /finally \{\s*loadingTabs\.delete\(tab\)\s*\}/)
    // 旧共享布尔方案不应存在
    assert.doesNotMatch(sidebarSource, /tabLoading\.value = /)
})

test('sidebar current tab renders only its matching bucket', () => {
    assert.match(sidebarSource, /sessionTab\.value === 'chats'\s*\n\s*\? sessionsState\.sessionsResult\?\.sessions/)
    assert.match(sidebarSource, /sessionTab\.value === 'plans'\s*\n\s*\? sessionsState\.taskSessionsResult\?\.sessions/)
    assert.match(sidebarSource, /: sessionsState\.archivedSessionsResult\?\.sessions/)
})

test('sidebar empty state per tab and loading indicator during first lazy load', () => {
    // 空态按 tab 显示 noChats/noPlans/noArchived
    assert.match(sidebarSource, /sessionTab === 'chats' \? 'sidebar\.noChats' : sessionTab === 'plans' \? 'sidebar\.noPlans' : 'sidebar\.noArchived'/)
    // 首次懒加载在途显示 loading 而非误导性空态
    assert.match(sidebarSource, /<div v-if="tabLoading"[\s\S]*?loading loading-spinner/)
    assert.match(sidebarSource, /<div v-else-if="!displaySessions \|\| displaySessions\.length === 0"/)
})

test('sidebar empty state keys exist in both zh and en locales', () => {
    const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
    const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')
    for (const source of [zhSource, enSource]) {
        assert.match(source, /noChats: '/)
        assert.match(source, /noPlans: '/)
        assert.match(source, /noArchived: '/)
    }
})

test('sidebar row menu is tab-aware', () => {
    // 对话 tab 才有置顶/取消置顶（后端 pin 只作用于普通列表），且置顶分支只在 chats 条件内
    assert.match(sidebarSource, /if \(sessionTab\.value === 'chats'\) \{\s*items\.push\(\{\s*key: session\.pinned \? 'unpin' : 'pin'/)
    assert.doesNotMatch(sidebarSource, /key: session\.pinned \? 'unpin' : 'pin'[\s\S]*?sessionTab\.value === 'plans'/)
    // 菜单按行归档状态切换：已归档行显示取消归档；
    // 归档入口仅对话 tab（任务会话不支持归档），用 else if 限定在 chats 条件内
    assert.match(sidebarSource, /if \(session\.archived\) \{\s*items\.push\(\{\s*key: 'unarchive'[\s\S]*?\} else if \(sessionTab\.value === 'chats'\) \{\s*(?:\/\/[^\n]*\n\s*)*items\.push\(\{\s*key: 'archive'/)
})

test('sidebar tab follows the active session bucket after navigation', () => {
    // 通知点击/路由跳转 /chat/:id 后，tab 自动切到该会话所属桶：
    // 三桶各自可命中，桶未加载/无此会话时返回 null（等待回填，不盲切）
    assert.match(sidebarSource, /const sessionTabOfKey = \(key: string\): SidebarSessionTab \| null => \{[\s\S]*?sessionsResult\?\.sessions\?\.some\(s => s\.id === key\)\) return 'chats'[\s\S]*?taskSessionsResult\?\.sessions\?\.some\(s => s\.id === key\)\) return 'plans'[\s\S]*?archivedSessionsResult\?\.sessions\?\.some\(s => s\.id === key\)\) return 'archived'[\s\S]*?return null/)
    // 同时监听 activeSessionKey 与三桶引用：冷启动点通知时桶由 getSessionById 单查回填，命中晚于跳转
    assert.match(sidebarSource, /watch\(\[activeSessionKey, \(\) => sessionsState\.sessionsResult, \(\) => sessionsState\.taskSessionsResult, \(\) => sessionsState\.archivedSessionsResult\]/)
    // followedKey 一次性跟随：同一次跳转只切一次，之后用户手动切其他 tab 浏览不被拉回
    assert.match(sidebarSource, /if \(!key \|\| followedKey === key\) return/)
    assert.match(sidebarSource, /followedKey = key/)
    // 桶未回填时等待下一次桶变化，不动作
    assert.match(sidebarSource, /if \(!tab\) return/)
    // 命中且非当前 tab 时走 switchSessionTab（复用懒加载与重试语义）
    assert.match(sidebarSource, /if \(tab !== sessionTab\.value\) void switchSessionTab\(tab\)/)
})
