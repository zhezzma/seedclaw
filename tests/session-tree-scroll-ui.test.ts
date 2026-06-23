import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const src = (...parts: string[]) => readFileSync(path.resolve(testDir, '../src', ...parts), 'utf8')

test('chat state keeps tree data but no client rewrite-from-here action', () => {
    const source = src('composables/useChatState.ts')

    assert.match(source, /sessionLeafId: string \| null/)
    assert.match(source, /preview\?: string/)
    assert.doesNotMatch(source, /rewriteFromHere/)
    assert.doesNotMatch(source, /rewrite-from-here/)
})

test('virtual message list exposes entry scrolling for virtualized rows', () => {
    const source = src('components/chat/VirtualMessageList.vue')

    assert.match(source, /const scrollToEntry = async \(entryId: string\)/)
    assert.match(source, /defineExpose\(\{\s*scrollToEntry\s*\}\)/)
    assert.match(source, /querySelectorAll<HTMLElement>\('\[data-key\]'\)/)
    assert.match(source, /scrollIntoView\(\{ block: 'center', inline: 'nearest' \}\)/)
})

test('chat header still exposes a tree button event for the session page', () => {
    const source = src('components/chat/ChatHeader.vue')

    assert.match(source, /QueueListIcon/)
    assert.match(source, /\(e: 'open-session-tree'\): void/)
    assert.match(source, /emit\('open-session-tree'\)/)
    assert.match(source, /\$t\('chat\.openSessionTree'\)/)
})

test('session tree modal emits jump-to-entry on message node click', () => {
    const source = src('components/chat/SessionTreeModal.vue')

    assert.match(source, /\(e: 'jump-to-entry', entryId: string\): void/)
    assert.match(source, /canJump\(row\)/)
    assert.match(source, /emit\('jump-to-entry', row\.entry\.id\)/)
    assert.match(source, /row\.entry\.preview/)
    assert.doesNotMatch(source, /rewrite-from-here/)
    assert.doesNotMatch(source, /rewriteFromHere/)
})

test('home view opens tree from button or /tree and scrolls selected nodes', () => {
    const source = src('views/HomeView.vue')

    assert.match(source, /SessionTreeModal/)
    assert.match(source, /const virtualMessageListRef = ref<InstanceType<typeof VirtualMessageList> \| null>\(null\)/)
    assert.match(source, /const handleJumpToTreeEntry = async \(entryId: string\)/)
    assert.match(source, /processedMessages\.value\.some\(message => message\.entryId === entryId\)/)
    assert.match(source, /findBranchLeafId\(entryId, branchIndexes\.value\)/)
    assert.match(source, /await chatState\.navigateBranch\(leafId\)/)
    assert.match(source, /await virtualMessageListRef\.value\?\.scrollToEntry\(entryId\)/)
    assert.match(source, /const isTreeCommand = inputText\.trim\(\) === '\/tree'/)
    assert.match(source, /@open-session-tree="openSessionTree"/)
    assert.match(source, /@jump-to-entry="handleJumpToTreeEntry"/)
    assert.doesNotMatch(source, /rewriteFromHere/)
    assert.doesNotMatch(source, /rewrite-from-here/)
})
