import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const navigationSource = readFileSync(path.join(root, 'src/config/navigation.ts'), 'utf8')
const sidebarSource = readFileSync(path.join(root, 'src/components/AppSidebar.vue'), 'utf8')
const sessionSidebarSource = readFileSync(path.join(root, 'src/components/chat/SessionSidebar.vue'), 'utf8')
const sessionActionMenuSource = readFileSync(path.join(root, 'src/components/chat/SessionActionMenu.vue'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')

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
    assert.match(sidebarSource, /const sessionMenuItems = computed<SessionMenuItem\[]>\(\(\) => \[/)
    assert.match(sidebarSource, /key: 'archive',[\s\S]*?label: t\('sidebar\.archive'\)/)
    assert.match(sidebarSource, /key: 'delete',[\s\S]*?label: t\('common\.delete'\)/)
    assert.match(sidebarSource, /:actions="sessionMenuItems"/)
})

test('session action menu wiring stops row selection click bubbling', () => {
    assert.match(sessionActionMenuSource, /const toggleMenu = \(event: MouseEvent\) => {[\s\S]*?event\.stopPropagation\(\)/)
    assert.match(sessionActionMenuSource, /const handleSelect = \(key: string, event: MouseEvent\) => {[\s\S]*?event\.stopPropagation\(\)/)
    assert.match(sessionActionMenuSource, /<ul[\s\S]*?@click\.stop/)
    assert.match(sidebarSource, /<a v-for="session in displaySessions"[\s\S]*?@click="selectSession\(session\.key\)"/)
})

test('session action menu uses icon-only vertical trigger with accessible title and required menu id', () => {
    assert.match(sessionActionMenuSource, /import \{ EllipsisVerticalIcon \} from '@heroicons\/vue\/24\/outline'/)
    assert.match(sessionActionMenuSource, /menuId:[\s\S]*?type: String,[\s\S]*?required: true/)
    assert.match(sessionActionMenuSource, /:title="title \|\| \$t\('sidebar\.more'\)"/)
    assert.match(sessionActionMenuSource, /:aria-label="title \|\| \$t\('sidebar\.more'\)"/)
    assert.match(sessionActionMenuSource, /<EllipsisVerticalIcon class="h-4 w-4" \/>/)
    assert.doesNotMatch(sessionActionMenuSource, /<span class="text-xs">\{\{ title \|\| \$t\('sidebar\.more'\) \}\}<\/span>/)
})

test('session action menu coordinates a shared module-scoped active menu and only binds outside click handler while open', () => {
    assert.match(sessionActionMenuSource, /<script lang="ts">[\s\S]*?const sharedActiveMenuId = ref<string \| null>\(null\)/)
    assert.match(sessionActionMenuSource, /export default defineComponent\([\s\S]*?setup\(props, \{ emit \}\)/)
    assert.doesNotMatch(sessionActionMenuSource, /<script setup/)
    assert.match(sessionActionMenuSource, /watch\(sharedActiveMenuId, \(currentMenuId\) => {[\s\S]*?currentMenuId !== props\.menuId[\s\S]*?isOpen\.value = false/)
    assert.match(sessionActionMenuSource, /watch\(isOpen, \(open\) => {[\s\S]*?if \(open\) {[\s\S]*?sharedActiveMenuId\.value = props\.menuId[\s\S]*?document\.addEventListener\('click', handleClickOutside\)[\s\S]*?}[\s\S]*?document\.removeEventListener\('click', handleClickOutside\)/)
    assert.doesNotMatch(sessionActionMenuSource, /setup\(props, \{ emit \}\)[\s\S]*?const sharedActiveMenuId = ref<string \| null>\(null\)/)
    assert.doesNotMatch(sessionActionMenuSource, /onMounted\([\s\S]*?document\.addEventListener\('click', handleClickOutside\)/)
})


test('sidebars pass stable prefixed menu ids to session action menus', () => {
    assert.match(sidebarSource, /:menu-id="`recent:\$\{session\.key\}`"/)
    assert.match(sessionSidebarSource, /:menu-id="`list:\$\{s\._id\}`"/)
})

test('sidebar i18n includes archived and more copy in Chinese and English', () => {
    assert.match(zhSource, /archived: '已归档'/)
    assert.match(zhSource, /archive: '归档'/)
    assert.match(zhSource, /unarchive: '取消归档'/)
    assert.match(zhSource, /more: '更多'/)
    assert.match(enSource, /archived: 'Archived'/)
    assert.match(enSource, /archive: 'Archive'/)
    assert.match(enSource, /unarchive: 'Unarchive'/)
    assert.match(enSource, /more: 'More'/)
})
