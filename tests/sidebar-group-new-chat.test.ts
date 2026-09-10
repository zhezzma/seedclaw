import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const sidebarSource = readFileSync(path.join(root, 'src/components/AppSidebar.vue'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')

test('agent group header shows a + button to start a new chat for that agent', () => {
    // 组头名称占 flex-1，把 + 按钮推到行右侧
    assert.match(
        sidebarSource,
        /<span class="truncate flex-1">\{\{ session\.label \}\}<\/span>/,
        'group header label should stretch so the + button sits on the right',
    )

    // 组头行右侧 + 按钮：仅非空组（有 agentId）显示，@click.stop 阻止触发展开/收起
    assert.match(
        sidebarSource,
        /v-if="session\.groupKey"[\s\S]*?@click\.stop="createSessionForAgent\(session\.groupKey\)"/,
        'group header should render a + button bound to createSessionForAgent for non-empty groups',
    )

    // 键盘事件不冒泡到组头（Enter/Space 只触发按钮自身，不会顺带展开/收起）；
    // 锚定在 + 按钮块内，避免匹配到文件其他位置的 @keydown.stop
    assert.match(
        sidebarSource,
        /@click\.stop="createSessionForAgent\(session\.groupKey\)"[\s\S]*?@keydown\.stop/,
    )

    // 可访问性：title/aria-label 使用同一 i18n key
    assert.match(sidebarSource, /:title="\$t\('sidebar\.newChatForAgent'\)"/)
    assert.match(sidebarSource, /:aria-label="\$t\('sidebar\.newChatForAgent'\)"/)

    // + 图标
    assert.match(sidebarSource, /<PlusIcon class="h-3\.5 w-3\.5"/)
})

test('createSessionForAgent navigates to the new-session route with ?agent=<id>', () => {
    // 复用 NEW_SESSION_ROUTE_NAME，query.agent 指定智能体；同时关闭移动端抽屉
    assert.match(
        sidebarSource,
        /const createSessionForAgent = \(agentId: string\) => \{\s*router\.push\(\{ name: NEW_SESSION_ROUTE_NAME, query: \{ agent: agentId \} \}\)\s*closeSidebarDrawer\(\)\s*\}/,
        'sidebar should navigate to the new-session route with the agent id as a query param',
    )
})

test('sidebar newChatForAgent i18n keys exist in zh and en locales', () => {
    assert.match(zhSource, /newChatForAgent: '为该智能体新建对话'/)
    assert.match(enSource, /newChatForAgent: 'New chat with this agent'/)
})
