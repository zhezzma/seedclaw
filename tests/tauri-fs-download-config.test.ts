import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')

const packageJson = readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
const cargoToml = readFileSync(path.join(repoRoot, 'src-tauri/Cargo.toml'), 'utf8')
const libRs = readFileSync(path.join(repoRoot, 'src-tauri/src/lib.rs'), 'utf8')
const capability = readFileSync(path.join(repoRoot, 'src-tauri/capabilities/default.json'), 'utf8')
const manifest = readFileSync(path.join(repoRoot, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml'), 'utf8')

test('tauri download stack includes fs plugin, scoped Download permission, and android storage permissions', () => {
  assert.match(packageJson, /"@tauri-apps\/plugin-fs"\s*:/)
  assert.match(cargoToml, /tauri-plugin-fs\s*=\s*"2"/)
  assert.match(libRs, /\.plugin\(tauri_plugin_fs::init\(\)\)/)
  assert.match(capability, /"fs:allow-write-file"/)
  assert.match(capability, /\$DOWNLOAD\/\*/)
  assert.match(manifest, /android\.permission\.READ_EXTERNAL_STORAGE/)
  assert.match(manifest, /android\.permission\.WRITE_EXTERNAL_STORAGE/)
})
