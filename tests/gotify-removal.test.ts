import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')

test('gotify source files are fully removed', () => {
    assert.equal(existsSync(path.join(root, 'src/composables/useGotify.ts')), false)
    assert.equal(existsSync(path.join(root, 'src-tauri/src/gotify.rs')), false)
})

test('no gotify references remain in frontend sources', () => {
    // 排除 i18n 历史无关目录；这里直接全仓库 src 扫描
    const out = execSync(
        `grep -ril gotify ${path.join(root, 'src')} || true`,
        { encoding: 'utf8' },
    ).trim()
    assert.equal(out, '')
})

test('no gotify references remain in tauri rust sources', () => {
    const out = execSync(
        `grep -ril gotify ${path.join(root, 'src-tauri/src')} || true`,
        { encoding: 'utf8' },
    ).trim()
    assert.equal(out, '')
})

test('settings store no longer persists gotify fields', () => {
    const storeSource = readFileSync(path.join(root, 'src/stores/setting.ts'), 'utf8')
    assert.doesNotMatch(storeSource, /gotify/i)
})

test('SettingsView removed the gotify entry, modal and handlers', () => {
    const viewSource = readFileSync(path.join(root, 'src/views/SettingsView.vue'), 'utf8')
    assert.doesNotMatch(viewSource, /gotify/i)
    assert.doesNotMatch(viewSource, /BellIcon/)
})

test('i18n drops gotify-specific keys in zh and en', () => {
    const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
    const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')
    for (const source of [zhSource, enSource]) {
        assert.doesNotMatch(source, /gotify/i)
        assert.doesNotMatch(source, /serverAddress/)
        assert.doesNotMatch(source, /clientToken/)
    }
})

test('useAppInit no longer initializes gotify', () => {
    const initSource = readFileSync(path.join(root, 'src/composables/useAppInit.ts'), 'utf8')
    assert.doesNotMatch(initSource, /gotify/i)
})
