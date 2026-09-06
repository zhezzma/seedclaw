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
