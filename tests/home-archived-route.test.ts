import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const homeViewSource = readFileSync(path.join(root, 'src/views/HomeView.vue'), 'utf8')
const sessionSidebarSource = readFileSync(path.join(root, 'src/components/chat/SessionSidebar.vue'), 'utf8')
const chatHeaderSource = readFileSync(path.join(root, 'src/components/chat/ChatHeader.vue'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')

test('HomeView handles archived route mode and loads archived sessions', () => {
    assert.match(homeViewSource, /const routeMode = computed<'chat' \| 'tasks' \| 'archived'>\(\(\) => {[\s\S]*?if \(route\.name === 'archived'\) return 'archived'/)
    assert.match(homeViewSource, /if \(routeName === 'archived'\) {[\s\S]*?await sessionsState\.loadArchivedSessions\(\)/)
    assert.match(homeViewSource, /return sessionsState\.archivedSessionsResult\?\.sessions \|\| \[\]/)
})

test('HomeView archived split view uses archived list copy and archived detail navigation', () => {
    assert.match(homeViewSource, /t\('home\.archivedSessionList'\)/)
    assert.match(homeViewSource, /splitViewTitle = computed\(\(\) => isArchivedSessionsRoute\.value[\s\S]*?t\('home\.archivedSessionList'\)/)
    assert.match(homeViewSource, /const handleSplitSessionSelect = \(key: string\) => {[\s\S]*?router\.push\({[\s\S]*?name: routeMode\.value,[\s\S]*?params: \{ sessionkey: key \},?[\s\S]*?}\)/)
    assert.match(homeViewSource, /router\.push\({ name: 'archived' }\)/)
})

test('ChatHeader mobile back button handles archived split routes', () => {
    assert.match(chatHeaderSource, /const splitRouteNames = \['tasks', 'archived'\] as const/)
    assert.match(chatHeaderSource, /splitRouteNames\.includes\(route\.name as typeof splitRouteNames\[number\]\)/)
    assert.match(chatHeaderSource, /router\.back\(\)/)
})

test('SessionSidebar supports unarchive row actions', () => {
    assert.match(sessionSidebarSource, /rowActions\?: SessionSidebarRowAction\[\]/)
    assert.match(sessionSidebarSource, /SessionActionMenu/)
    assert.match(sessionSidebarSource, /const confirmDelete = async \(key: string\) => {[\s\S]*?emit\('delete', key\)/)
    assert.match(sessionSidebarSource, /const handleRowAction = async \(key: string, action: string\) => {[\s\S]*?if \(action === 'delete'\) {[\s\S]*?await confirmDelete\(key\)[\s\S]*?emit\('row-action', \{ key, action \}\)/)
    assert.match(homeViewSource, /key: 'unarchive',[\s\S]*?label: t\('sidebar\.unarchive'\)/)
})

test('Chinese copy includes archived split-view empty state strings', () => {
    assert.match(zhSource, /archivedSessionList: '已归档会话列表'/)
    assert.match(zhSource, /noArchivedSessions: '暂无已归档会话'/)
})
