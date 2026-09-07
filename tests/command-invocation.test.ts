import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { isCommandInvocation } from '../src/utils/command-invocation.ts'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const homeViewPath = path.resolve(testDir, '../src/views/HomeView.vue')
const homeViewSource = readFileSync(homeViewPath, 'utf8')

const BUILTIN = ['name', 'reset', 'compact', 'tools', 'session', 'tree', 'debug', 'help']

test('已知命令（含大小写不敏感）判定为命令', () => {
    assert.equal(isCommandInvocation('/name 新名字', BUILTIN), true)
    assert.equal(isCommandInvocation('/NAME 新名字', BUILTIN), true)
    assert.equal(isCommandInvocation('/name', BUILTIN), true)
})

test('未知 / 开头文本（如路径）不是命令', () => {
    assert.equal(isCommandInvocation('/etc/hosts 是什么', BUILTIN), false)
    assert.equal(isCommandInvocation('/home/user/data.txt 帮我分析下', BUILTIN), false)
    assert.equal(isCommandInvocation('/tmp', BUILTIN), false)
})

test('首 token 须完整命中，/tools/mytool 不算 /tools 命令', () => {
    assert.equal(isCommandInvocation('/tools/mytool 列一下', BUILTIN), false)
})

test('! 开头恒为命令（后端按 bash 执行）', () => {
    assert.equal(isCommandInvocation('!ls -la', BUILTIN), true)
    assert.equal(isCommandInvocation('!ls', null), true)
})

test('普通消息不是命令', () => {
    assert.equal(isCommandInvocation('帮我写个排序算法', BUILTIN), false)
    assert.equal(isCommandInvocation('', BUILTIN), false)
    assert.equal(isCommandInvocation('   /name foo', BUILTIN), true)
})

test('命令表未加载（null/空）时保守回退为命令', () => {
    assert.equal(isCommandInvocation('/whatever', null), true)
    assert.equal(isCommandInvocation('/whatever', []), true)
    assert.equal(isCommandInvocation('普通消息', null), false)
})

test('裸 / 与 “/ name”（斜杠后空白）不算命令，与后端语义一致', () => {
    assert.equal(isCommandInvocation('/', BUILTIN), false)
    assert.equal(isCommandInvocation('/ name', BUILTIN), false)
})

test('HomeView 自动命名接线使用 isCommandInvocation（且传入命令表与回退逻辑）', () => {
    assert.match(
        homeViewSource,
        /isCommandInvocation\(\s*trimmedUserText,/, 'auto-rename should pass the original user text to the matcher',
    )
    assert.match(
        homeViewSource,
        /isLoaded\.value \? allCommands\.value\.map\(cmd => cmd\.name\) : null/,
        'auto-rename should match against the /api/commands table with conservative null fallback',
    )
})
