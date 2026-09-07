// node:test 风格（纯函数，无 mock/无 vue 响应性），纳入 `node --test` 回归基线。
import test from 'node:test'
import assert from 'node:assert/strict'

import { gatewaySwitchTargetUrl } from '../src/utils/route-helpers.ts'

test('gatewaySwitchTargetUrl: /chat/<sessionkey> → 落到 /new（清掉 sessionKey）', () => {
    assert.equal(gatewaySwitchTargetUrl('/chat/abc123'), '/new')
    assert.equal(gatewaySwitchTargetUrl('/chat/session-with-dash_underscore'), '/new')
    // URL 编码的 sessionKey 同样要清掉
    assert.equal(gatewaySwitchTargetUrl('/chat/a%2Fb'), '/new')
})

test('gatewaySwitchTargetUrl: 无 sessionKey 或非 chat 路由 → 不改写（null）', () => {
    // /chat/（空 key）不改写：vue-router 可选参数视作空，HomeView 默认行为同样落到 /new
    assert.equal(gatewaySwitchTargetUrl('/chat/'), null)
    assert.equal(gatewaySwitchTargetUrl('/chat'), null)
    assert.equal(gatewaySwitchTargetUrl('/new'), null)
    assert.equal(gatewaySwitchTargetUrl('/'), null)
    assert.equal(gatewaySwitchTargetUrl('/settings'), null)
    assert.equal(gatewaySwitchTargetUrl('/agents?agentId=x'), null)
})
