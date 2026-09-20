import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/chat/MessageBubble.vue')
const source = readFileSync(componentPath, 'utf8')

const getSection = (startMarker: string, endMarker: string) => {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    assert.notEqual(start, -1, `missing section start: ${startMarker}`)
    assert.notEqual(end, -1, `missing section end: ${endMarker}`)
    return source.slice(start, end)
}

// 背景 bug：用户在收到回复前点停止 → 空 aborted assistant 消息按设计零渲染
// （compaction-visibility.test.ts 钉死的签名，用户停止与在线压缩 abort 共用），
// 该分支上没有任何 assistant 气泡 → 分支导航只挂在 assistant footer 上 →
// 切到该分支（第一页）后没有任何导航/操作，成为死胡同。
// user 消息是每个分支的必现锚点，分支导航必须同样挂在 user footer 上，
// 但仅限分支尾锚场景（isBranchTail：紧随其后的不是本回合 assistant 回复）：
// 否则分叉点的 user 气泡与 assistant 气泡会对同一回合重复渲染 n/n 计数器；
// 且 isLastMessage 不够——分支被续写后（停止后直接输入新消息会挂在空 aborted
// 之下，见 SessionManager.appendMessage 的 leafId 语义）分叉点不再是末项。
test('user toolbar renders branch navigation for multi-branch sessions', () => {
    const section = getSection('<!-- User Actions (Hover) -->', '<!-- Assistant Message Bubble -->')

    assert.ok(
        section.includes('isBranchTail && branchInfo && branchInfo.siblings.length > 1'),
        'user toolbar should render branch navigation only as branch-tail anchor',
    )
    assert.ok(
        section.includes(`emit('navigate-branch', message, 'prev')`),
        'user toolbar branch navigation should emit prev',
    )
    assert.ok(
        section.includes(`emit('navigate-branch', message, 'next')`),
        'user toolbar branch navigation should emit next',
    )
    assert.ok(
        section.includes('branchInfo.currentIndex + 1'),
        'user toolbar branch navigation should show current page counter',
    )
})

test('user branch navigation sits in normal mode after delete button', () => {
    const section = getSection('<!-- User Actions (Hover) -->', '<!-- Assistant Message Bubble -->')

    // 编辑态（v-if="isEditing" 分支）不应包含导航：编辑文本时横向切分支语义不明
    const normalModeStart = section.indexOf('<template v-else>')
    const deleteIndex = section.indexOf('@click="handleDelete"', normalModeStart)
    const navIndex = section.indexOf('isBranchTail && branchInfo', normalModeStart)

    assert.notEqual(normalModeStart, -1, 'user toolbar should keep a normal-mode branch')
    assert.notEqual(deleteIndex, -1, 'user toolbar normal mode should keep delete button')
    assert.notEqual(navIndex, -1, 'user toolbar normal mode should render branch navigation')
    assert.ok(navIndex > deleteIndex, 'user branch navigation should come after action buttons')
})

// isBranchTail 公式钉子：紧随其后的显示项不是 assistant 回复即分支尾锚
// （覆盖死胡同末项与「停止后直接续写」两个场景；正常回合 next 为 assistant，不渲染）
test('virtual list computes isBranchTail from next message role', () => {
    const source = readFileSync(
        path.resolve(testDir, '../src/components/chat/VirtualMessageList.vue'),
        'utf8',
    )

    assert.ok(
        source.includes("props.messages[i + 1]?.role !== 'assistant'"),
        'isBranchTail should be true when next display item is not an assistant reply',
    )
    assert.ok(
        source.includes(':is-branch-tail="item.isBranchTail"'),
        'isBranchTail should be wired through to MessageBubble',
    )
})
