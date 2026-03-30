import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const navigationSource = readFileSync(path.join(root, 'src/config/navigation.ts'), 'utf8')
const sidebarSource = readFileSync(path.join(root, 'src/components/AppSidebar.vue'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')

test('navigation adds archived nav item immediately after task sessions', () => {
    assert.match(
        navigationSource,
        /label: 'sidebar\.taskSessions'[\s\S]*?route: 'tasks'[\s\S]*?label: 'sidebar\.archived'[\s\S]*?route: 'archived'/,
    )
})

test('AppSidebar uses SessionActionMenu for recent chat row actions', () => {
    assert.match(sidebarSource, /import SessionActionMenu from '\.\/chat\/SessionActionMenu\.vue'/)
    assert.match(sidebarSource, /<SessionActionMenu[\s\S]*?@select="handleSessionMenuSelect\(session, \$event\)"/)
})

test('recent chat more menu includes archive and delete actions', () => {
    assert.match(sidebarSource, /key: 'archive',[\s\S]*?label: t\('sidebar\.archive'\)/)
    assert.match(sidebarSource, /key: 'delete',[\s\S]*?label: t\('common\.delete'\)/)
})

test('Chinese i18n includes archived sidebar copy', () => {
    assert.match(zhSource, /archived: '已归档'/)
    assert.match(zhSource, /archive: '归档'/)
    assert.match(zhSource, /unarchive: '取消归档'/)
    assert.match(zhSource, /more: '更多'/)
})
