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

// 回归钉子（2026-09-20 session 01a0bf01）：用户在收到回复前点停止 → 空 aborted
// assistant 消息落盘（content=[]），该分支唯一可见锚点是 user 消息。
// user 角色消息必须能拿到与 assistant 侧一致的兄弟分支列表，否则该分支
// 没有任何导航挂载点，切进去就是死胡同。
test('user message on aborted-branch resolves sibling navigation and leaf through meta entries', () => {
    const tree: SessionTreeEntry[] = [
        { id: 'root', parentId: null, type: 'root' },
        { id: 'meta-model', parentId: 'root', type: 'model_change' },
        { id: 'meta-thinking', parentId: 'meta-model', type: 'thinking_level_change' },
        { id: 'user-1', parentId: 'meta-thinking', type: 'message', message: { role: 'user' } },
        { id: 'meta-state', parentId: 'user-1', type: 'custom' },
        { id: 'meta-info', parentId: 'meta-state', type: 'session_info' },
        { id: 'assistant-aborted', parentId: 'meta-info', type: 'message', message: { role: 'assistant' } },
        { id: 'branch-summary', parentId: 'assistant-aborted', type: 'branch_summary' },
        { id: 'user-2', parentId: 'meta-thinking', type: 'message', message: { role: 'user' } },
        { id: 'meta-state-2', parentId: 'user-2', type: 'custom' },
        { id: 'assistant-2', parentId: 'meta-state-2', type: 'message', message: { role: 'assistant' } },
    ]

    const indexes = buildBranchIndexes(tree)

    // user 气泡上的导航：ownSiblings 即分支列表
    assert.deepEqual(
        getBranchInfo({ role: 'user', entryId: 'user-1', parentEntryId: 'meta-thinking' }, indexes),
        { siblings: ['user-1', 'user-2'], currentIndex: 0 },
    )
    // 与 assistant 气泡侧（分支2）的 parentSiblings 是同一批 user id
    assert.deepEqual(
        getBranchInfo({ role: 'assistant', entryId: 'assistant-2', parentEntryId: 'meta-state-2' }, indexes),
        { siblings: ['user-1', 'user-2'], currentIndex: 1 },
    )
    // 叶子解析穿过 custom/session_info 到达空 aborted assistant
    assert.equal(findLeafId('user-1', indexes), 'branch-summary')
})
