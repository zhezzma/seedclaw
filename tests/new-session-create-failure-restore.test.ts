import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const homeViewSource = readFileSync(path.resolve(testDir, '../src/views/HomeView.vue'), 'utf8')
const zhSource = readFileSync(path.resolve(testDir, '../src/i18n/zh.ts'), 'utf8')
const enSource = readFileSync(path.resolve(testDir, '../src/i18n/en.ts'), 'utf8')

test('new-session send path restores optimistic-cleared input when commitNewSession fails', () => {
    // /new 发送会先乐观清空输入框与附件再 commitNewSession；
    // 创建失败（网络错误等）必须恢复输入并提示，否则静默吞掉用户输入。
    // 提取 commitNewSession 的 try/catch 片段定位。
    const anchor = homeViewSource.indexOf('targetSessionKey = await sessionsState.commitNewSession')
    assert.notEqual(anchor, -1, 'commitNewSession call should exist in the /new send path')
    const catchBlock = homeViewSource.slice(anchor, anchor + 600)

    assert.match(
        catchBlock,
        /catch \(e\)[\s\S]*?chatInputRef\.value\.inputText = inputText[\s\S]*?chatInputRef\.value\.attachments = rawAttachments/,
        'the failure path should restore the optimistically cleared input text and attachments',
    )
    assert.match(
        catchBlock,
        /useToast\(\)\.error\(/,
        'the failure path should surface a toast instead of failing silently',
    )
    assert.match(
        catchBlock,
        /t\('home\.createSessionFailed'\)/,
        'the failure toast should use the home.createSessionFailed i18n key',
    )
})

test('home.createSessionFailed exists in both locales', () => {
    assert.match(zhSource, /createSessionFailed:/, 'zh locale should define home.createSessionFailed')
    assert.match(enSource, /createSessionFailed:/, 'en locale should define home.createSessionFailed')
})
