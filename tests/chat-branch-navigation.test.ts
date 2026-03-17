import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildBranchIndexes,
    findLeafId,
    getBranchInfo,
    type BranchMessageLike,
    type SessionTreeEntry,
} from '../src/utils/chatBranchNavigation.ts'

const getInfo = (tree: SessionTreeEntry[], msg: BranchMessageLike) =>
    getBranchInfo(msg, buildBranchIndexes(tree))

test('assistant branch navigation ignores dead user branches without assistant descendants', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'user-dead', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'user-live', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'assistant-live', parentId: 'user-live', type: 'message', message: { role: 'assistant' } },
    ]

    const info = getInfo(tree, {
        role: 'assistant',
        entryId: 'assistant-live',
        parentEntryId: 'user-live',
    })

    assert.equal(info, null)
})

test('assistant branch navigation keeps sibling user branches that both resolve to assistant replies', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'user-a', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'meta-a', parentId: 'user-a', type: 'session_info' },
        { id: 'assistant-a', parentId: 'meta-a', type: 'message', message: { role: 'assistant' } },
        { id: 'user-b', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'assistant-b', parentId: 'user-b', type: 'message', message: { role: 'assistant' } },
    ]

    const indexes = buildBranchIndexes(tree)
    const info = getBranchInfo(
        {
            role: 'assistant',
            entryId: 'assistant-b',
            parentEntryId: 'user-b',
        },
        indexes,
    )

    assert.deepEqual(info, {
        siblings: ['user-a', 'user-b'],
        currentIndex: 1,
    })
    assert.equal(findLeafId('user-a', indexes), 'assistant-a')
    assert.equal(findLeafId('user-b', indexes), 'assistant-b')
})

test('direct assistant siblings still produce branch navigation', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'user-1', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'assistant-a', parentId: 'user-1', type: 'message', message: { role: 'assistant' } },
        { id: 'assistant-b', parentId: 'user-1', type: 'message', message: { role: 'assistant' } },
    ]

    const info = getInfo(tree, {
        role: 'assistant',
        entryId: 'assistant-b',
        parentEntryId: 'user-1',
    })

    assert.deepEqual(info, {
        siblings: ['assistant-a', 'assistant-b'],
        currentIndex: 1,
    })
})

test('branch navigation still works when entries API omits message payloads', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'user-a', parentId: 'root', type: 'message' },
        { id: 'assistant-a', parentId: 'user-a', type: 'message' },
        { id: 'user-b', parentId: 'root', type: 'message' },
        { id: 'assistant-b', parentId: 'user-b', type: 'message' },
    ]

    const info = getInfo(tree, {
        role: 'assistant',
        entryId: 'assistant-b',
        parentEntryId: 'user-b',
    })

    assert.deepEqual(info, {
        siblings: ['user-a', 'user-b'],
        currentIndex: 1,
    })
})

test('deleted assistant siblings are excluded from direct assistant branch navigation', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'user-1', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'assistant-dead', parentId: 'user-1', type: 'message', message: { role: 'assistant', deletedAt: '2026-03-17T00:00:00Z' } },
        { id: 'assistant-live', parentId: 'user-1', type: 'message', message: { role: 'assistant' } },
    ]

    const info = getInfo(tree, {
        role: 'assistant',
        entryId: 'assistant-live',
        parentEntryId: 'user-1',
    })

    assert.equal(info, null)
})

test('branch lookup skips empty non-message child paths and finds assistant on later child path', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'user-a', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'meta-empty', parentId: 'user-a', type: 'session_info' },
        { id: 'meta-real', parentId: 'user-a', type: 'session_info' },
        { id: 'assistant-a', parentId: 'meta-real', type: 'message', message: { role: 'assistant' } },
        { id: 'user-b', parentId: 'root', type: 'message', message: { role: 'user' } },
        { id: 'assistant-b', parentId: 'user-b', type: 'message', message: { role: 'assistant' } },
    ]

    const indexes = buildBranchIndexes(tree)
    const info = getBranchInfo(
        {
            role: 'assistant',
            entryId: 'assistant-b',
            parentEntryId: 'user-b',
        },
        indexes,
    )

    assert.deepEqual(info, {
        siblings: ['user-a', 'user-b'],
        currentIndex: 1,
    })
    assert.equal(findLeafId('user-a', indexes), 'assistant-a')
})
