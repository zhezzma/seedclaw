import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function readWorkflow(name: string): string {
    return readFileSync(path.join(root, '.github', 'workflows', name), 'utf8')
}

test('ci workflow rebuilds seedagent on every push and publishes all artifacts to fixed latest tag', () => {
    const content = readWorkflow('ci.yml')

    assert.match(content, /on:\s*[\s\S]*push:/)
    assert.doesNotMatch(content, /pull_request:/)
    assert.doesNotMatch(content, /branches:\s*[\s\S]*- main/)
    assert.match(content, /branches:\s*[\s\S]*- seedagent/)
    assert.match(content, /workflow_dispatch:/)
    assert.match(content, /concurrency:\s*[\s\S]*group:\s*seedagent-build-latest/)
    // 单行匹配：允许中间出现额外 flag（如 --repo "$GITHUB_REPOSITORY"），
    // 但不跨行，避免误伤别处的命令。
    // 核心要素：删的是指定 tag + 自动确认 + 清理 tag + 容忍不存在。
    assert.match(content, /gh release delete seedagent-build-latest[^\n]*--yes --cleanup-tag \|\| true/)
    assert.match(content, /gh release create seedagent-build-latest/)
    assert.match(content, /--target \$\{\{ github\.sha \}\}/)
    assert.match(content, /actions\/setup-node@v4/)
    assert.match(content, /dtolnay\/rust-toolchain@stable/)
    assert.match(content, /tauri-apps\/tauri-action@v0/)
    assert.match(content, /npx tauri android build --target aarch64/)
    assert.match(content, /npx tauri android build --debug --target aarch64/)
    assert.match(content, /npm ci/)
    assert.match(content, /tar -czf seedclaw-web-dist\.tar\.gz dist/)
    assert.match(content, /files:\s*[\s\S]*seedclaw-web-dist\.tar\.gz/)
    assert.match(content, /tag_name:\s*seedagent-build-latest/)
})

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
