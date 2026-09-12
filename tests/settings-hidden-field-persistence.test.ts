import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const settingsSource = readFileSync(path.join(root, 'src/views/SettingsView.vue'), 'utf8')
const settingsStoreSource = readFileSync(path.join(root, 'src/stores/setting.ts'), 'utf8')

test('homePageBehavior setting is fully removed from settings UI and store', () => {
  assert.doesNotMatch(settingsSource, /homePageBehavior/)
  assert.doesNotMatch(settingsStoreSource, /homePageBehavior/)
})

test('lastActiveSessionKey is fully removed (write-only dead state)', () => {
  // 全仓库无读取方：setSessionKey/createNewSession 只写不读，删除后不得残留
  // （仅允许 loadConfig 迁移里的 delete 剥离旧键）
  assert.doesNotMatch(
      settingsStoreSource,
      /lastActiveSessionKey: string|lastActiveSessionKey: ''|setLastActiveSessionKey/,
      'store must not declare, default, or write lastActiveSessionKey anymore',
  )

  const chatStateSource = readFileSync(path.join(root, 'src/composables/useChatState.ts'), 'utf8')
  assert.doesNotMatch(
      chatStateSource,
      /lastActiveSessionKey|setLastActiveSessionKey/,
      'useChatState must stop persisting the last active session key',
  )

  // 旧用户 localStorage 里残留的 lastActiveSessionKey 键需在 loadConfig 迁移时剥离
  assert.match(
      settingsStoreSource,
      /delete parsed\.lastActiveSessionKey/,
      'loadConfig should strip the legacy lastActiveSessionKey key from saved configs',
  )
})
