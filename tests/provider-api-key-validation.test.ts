import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const providerFormSource = readFileSync(path.join(root, 'src/components/models/ProviderFormModal.vue'), 'utf8')
const setupViewSource = readFileSync(path.join(root, 'src/views/SetupView.vue'), 'utf8')

test('provider create and edit forms do not require a non-empty API key', () => {
    assert.doesNotMatch(providerFormSource, /errors\.apiKey/, 'provider modal must not block save when API key is empty')
    assert.doesNotMatch(providerFormSource, /provider\.validation\.apiKeyRequired/, 'provider modal must not show API key as required')
    assert.doesNotMatch(setupViewSource, /!modelApiKey\.value/, 'setup model provider creation must allow an empty API key')
})
