import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const homeViewSource = readFileSync(path.join(root, 'src/views/HomeView.vue'), 'utf8')
const appSource = readFileSync(path.join(root, 'src/App.vue'), 'utf8')
const sessionSidebarSource = readFileSync(path.join(root, 'src/components/chat/SessionSidebar.vue'), 'utf8')
const chatHeaderSource = readFileSync(path.join(root, 'src/components/chat/ChatHeader.vue'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')

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

test('ChatHeader mobile back button handles archived split routes safely', () => {
    assert.match(chatHeaderSource, /const splitRouteNames = \['tasks', 'archived'\] as const/)
    assert.match(chatHeaderSource, /const splitListRouteName = splitRouteNames\.find\(name => name === route\.name\)/)
    assert.match(chatHeaderSource, /const hasUsableHistoryEntry = window\.history\.length > 1 && typeof window\.history\.state\?\.back === 'string'/)
    assert.match(chatHeaderSource, /if \(splitListRouteName && !hasUsableHistoryEntry\) {\s*router\.push\({ name: splitListRouteName }\)\s*return\s*}/)
    assert.match(chatHeaderSource, /router\.back\(\)/)
    assert.match(chatHeaderSource, /splitRouteNames\.includes\(route\.name as typeof splitRouteNames\[number\]\)/)
})

test('SessionSidebar delegates split-view clear-all and unarchive row actions to HomeView', () => {
    assert.match(sessionSidebarSource, /\(e: 'clear-all', keys: string\[\]\): void/)
    assert.match(sessionSidebarSource, /const handleDeleteAll = async \(\) => {[\s\S]*?const keys = normalizedSessions\.value\.map\(s => s\._id\)\.filter\(\(id\): id is string => !!id\)[\s\S]*?emit\('clear-all', keys\)/)
    assert.doesNotMatch(sessionSidebarSource, /await deleteSessions\(keys\)/)
    assert.match(sessionSidebarSource, /SessionActionMenu/)
    assert.match(sessionSidebarSource, /const confirmDelete = async \(key: string\) => {[\s\S]*?emit\('delete', key\)/)
    assert.match(sessionSidebarSource, /const handleRowAction = async \(key: string, action: string\) => {[\s\S]*?if \(action === 'delete'\) {[\s\S]*?await confirmDelete\(key\)[\s\S]*?emit\('row-action', \{ key, action \}\)/)
    assert.match(homeViewSource, /const handleSplitClearAll = async \(keys: string\[\]\) => {[\s\S]*?const selectedKey = typeof route\.params\.sessionkey === 'string'[\s\S]*?await sessionsState\.deleteSessions\(keys\)[\s\S]*?if \(result\?\.deleted && selectedKey && keys\.includes\(selectedKey\)\) {[\s\S]*?router\.push\({ name: routeMode\.value }\)/)
    assert.match(homeViewSource, /@clear-all="handleSplitClearAll"/)
    assert.match(homeViewSource, /key: 'unarchive',[\s\S]*?label: t\('sidebar\.unarchive'\)/)
})

test('App foreground resume validation treats archived routes like session detail routes', () => {
    assert.match(appSource, /const requiresSessionValidation = routeName === 'chat' \|\| routeName === 'tasks' \|\| routeName === 'archived'/)
    assert.match(appSource, /if \(!requiresSessionValidation \|\| !sessionKey\) {\s*return 'reload'\s*}/)
})

test('Archived split-view copy exists in Chinese and English locales', () => {
    assert.match(zhSource, /archivedSessionList: '已归档会话列表'/)
    assert.match(zhSource, /noArchivedSessions: '暂无已归档会话'/)
    assert.match(enSource, /archivedSessionList: 'Archived Session List'/)
    assert.match(enSource, /noArchivedSessions: 'No archived sessions yet'/)
})
