import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function readWorkflow(name: string): string {
    return readFileSync(path.join(root, '.github', 'workflows', name), 'utf8')
}

test('deploy-web workflow installs from lockfile and builds before deploy', () => {
    const content = readWorkflow('deploy-web.yml')

    assert.match(content, /npm ci/)
    assert.match(content, /npm run tcs/)
    assert.match(content, /npm run build/)
    assert.match(content, /cloudflare\/wrangler-action@v3/)
})

test('release workflow uses deterministic install and omits unused openclaw clone', () => {
    const content = readWorkflow('release.yml')

    assert.match(content, /npm ci/)
    assert.doesNotMatch(content, /clone openclaw repo/)
    assert.doesNotMatch(content, /git clone https:\/\/github\.com\/openclaw\/openclaw\.git/)
    assert.match(content, /libwebkit2gtk-4\.1-dev/)
    assert.match(content, /libayatana-appindicator3-dev/)
})
