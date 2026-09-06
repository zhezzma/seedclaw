// node:test 风格（纯函数，无 mock/无 vue 响应性），纳入 `node --test` 回归基线。
import test from 'node:test'
import assert from 'node:assert/strict'

import { isLocalGateway } from '../src/utils/gateway-url.ts'

test('isLocalGateway: localhost / 回环地址 → true', () => {
    assert.equal(isLocalGateway('http://localhost:18789'), true)
    assert.equal(isLocalGateway('https://tauri.localhost'), true)
    assert.equal(isLocalGateway('http://127.0.0.1:18789'), true)
    assert.equal(isLocalGateway('http://127.1.2.3:80'), true)
    assert.equal(isLocalGateway('http://[::1]:18789'), true)
})

test('isLocalGateway: 远程 / 局域网 / 非法 / 空 → false', () => {
    assert.equal(isLocalGateway('http://192.168.1.10:18789'), false)
    assert.equal(isLocalGateway('https://api.example.com'), false)
    assert.equal(isLocalGateway('not a url'), false)
    assert.equal(isLocalGateway(''), false)
})
