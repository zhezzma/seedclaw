// node:test 风格（纯函数，无 mock/无 vue 响应性），纳入 `node --test` 回归基线。
import test from 'node:test'
import assert from 'node:assert/strict'

import { isLocalGateway, gatewayHostLabel } from '../src/utils/gateway-url.ts'

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

test('isLocalGateway: 127 前缀欺骗域名（非 IPv4 形状）→ false', () => {
    assert.equal(isLocalGateway('http://127.0.0.1.evil.com'), false)
    assert.equal(isLocalGateway('http://127.1.2.3.com:80'), false)
})

test('gatewayHostLabel: 显式端口原样带回（账号菜单要区分同 host 不同端口）', () => {
    assert.equal(gatewayHostLabel('http://159.138.99.139:18799'), '159.138.99.139:18799')
    assert.equal(gatewayHostLabel('http://localhost:18789'), 'localhost:18789')
})

test('gatewayHostLabel: 默认端口省略（URL.host 语义）、尾斜杠无关', () => {
    assert.equal(gatewayHostLabel('https://api.example.com'), 'api.example.com')
    assert.equal(gatewayHostLabel('https://api.example.com:443/'), 'api.example.com')
    assert.equal(gatewayHostLabel('http://a.b/'), 'a.b')
})

test('gatewayHostLabel: 非法 / 空 → 空串（调用方回落原始串）', () => {
    assert.equal(gatewayHostLabel(''), '')
    assert.equal(gatewayHostLabel('not a url'), '')
    assert.equal(gatewayHostLabel('   '), '')
})
