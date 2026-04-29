import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const settingsSource = readFileSync(path.join(root, 'src/views/SettingsView.vue'), 'utf8')

test('basic settings save does not persist hidden homePageBehavior field', () => {
  const saveConnectionBlock = settingsSource.match(/const saveConnection = \(\) => \{[\s\S]*?\n\}/)
  assert.ok(saveConnectionBlock, 'expected to find saveConnection block')
  assert.doesNotMatch(saveConnectionBlock[0], /homePageBehavior:/)
})
