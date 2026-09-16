// tests/a2ui-action-attach-wiring.test.ts
// A2UI 面板提交后 attach 续跑流的 wiring 结构断言（useChatState / useA2UIActions 依赖
// Vue 响应性单例，node --test 无法直接实例化——与 attach-idle-done-refresh.test.ts 同模式）。
//
// 背景bug（v1.0 升级回归）：面板点击选项后客户端零反馈，刷新才看到提交回显与回复。
// 根因：v1.0 起面板 action 改走 POST /api/a2ui/events（纯 JSON RPC），服务端 handler
// 以 steer 触发的续跑 run 由服务端发起——客户端没有经 chat POST 打开这条流的 SSE，
// 注入的 /a2ui-event 提交回显与续跑回复都不在任何实时通道上。
// 修复：event 类 action 上送成功后，客户端对当前会话立即 attachToSessionIfNeeded——
// 服务端 attach 对进行中 run 附着到 settled（此时 steer run 必已 isStreaming：
// _runAgentPrompt 入口同步置位，先于 action 响应写回），对已落定的空闲会话立即
// done 并走既有全量刷新兜底。与切会话/刷新恢复共用同一 attach 机制，不新开通道。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const chatStateSource = readFileSync(path.join(repoRoot, 'src/composables/useChatState.ts'), 'utf8')
const a2uiActionsSource = readFileSync(path.join(repoRoot, 'src/composables/useA2UIActions.ts'), 'utf8')

test('useChatState 导出 attachToSessionIfNeeded 供跨 composable 复用', () => {
    assert.match(chatStateSource, /export function attachToSessionIfNeeded\(/,
        'attachToSessionIfNeeded 应带 export（a2ui action 提交后的续跑流附着入口）')
})

test('handleA2UIAction event 分支：上送成功后对当前会话发起 attach', () => {
    // 引入来自 useChatState（attach 实现所在，非复制粘贴）
    assert.match(a2uiActionsSource, /import \{[^}]*attachToSessionIfNeeded[^}]*\} from '\.\/useChatState'/,
        '应从 useChatState 导入 attachToSessionIfNeeded')

    // 只在 event 分支（会触发服务端续跑 run 的提交语义）内 attach
    const eventIdx = a2uiActionsSource.indexOf("if ('event' in action)")
    const fnIdx = a2uiActionsSource.indexOf("if ('functionCall' in action)")
    assert.ok(eventIdx > 0, "event 分支未找到")
    assert.ok(fnIdx > eventIdx, 'functionCall 分支应在 event 分支之后')
    const eventBranch = a2uiActionsSource.slice(eventIdx, fnIdx)

    // attach 在响应消息应用之后（先就地回填 /result，再接管续跑流）
    const applyIdx = eventBranch.indexOf('applyResponseMessages(messages)')
    const attachIdx = eventBranch.indexOf('attachToSessionIfNeeded(')
    assert.ok(applyIdx > 0, 'event 分支应先 applyResponseMessages')
    assert.ok(attachIdx > applyIdx, 'applyResponseMessages 之后应调用 attachToSessionIfNeeded（提交触发的服务端 run 无客户端消费者，不 attach 则回显与回复刷新才可见）')

    // 用当前会话 key（面板只存在于当前查看的会话），空 key 守卫
    assert.match(eventBranch, /attachToSessionIfNeeded\((?:const )?[^)]*sessionKey[^)]*\)|const \w+ = \w+\.sessionKey/,
        'attach 目标应是当前会话 key')
    const guardIdx = eventBranch.search(/if \(\w+\) attachToSessionIfNeeded|if \(!\w+\) return[\s\S]*?attachToSessionIfNeeded|if \(\w+\) \{[\s\S]*?attachToSessionIfNeeded/)
    assert.ok(guardIdx > 0, 'sessionKey 为空时应跳过 attach（守卫）')
})

test('handleA2UIAction functionCall 分支与错误路径不触发 attach', () => {
    // rpc 调用不产生 run，attach 无意义
    const fnIdx = a2uiActionsSource.indexOf("if ('functionCall' in action)")
    assert.ok(fnIdx > 0, 'functionCall 分支未找到')
    const tail = a2uiActionsSource.slice(fnIdx)
    const catchIdx = tail.indexOf('} catch')
    const rpcBranch = catchIdx > 0 ? tail.slice(0, catchIdx) : tail
    assert.ok(!rpcBranch.includes('attachToSessionIfNeeded'),
        'functionCall（rpc）分支不应 attach')

    // catch（404/409 面板失效等）：服务端没有受理，更没有 run，不 attach
    const catchBlock = catchIdx > 0 ? tail.slice(catchIdx) : ''
    assert.ok(catchBlock.length > 0, 'catch 块未找到')
    assert.ok(!catchBlock.includes('attachToSessionIfNeeded'), '错误路径不应 attach')
})
