import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const source = readFileSync(path.join(repoRoot, 'src/views/HomeView.vue'), 'utf8')

test('HomeView synchronizes processed session images into the shared lightbox', () => {
    assert.match(source, /import \{ collectSessionImageSources \} from '\.\.\/utils\/session-image-gallery'/)
    assert.match(source, /import \{ useMediaPreview \} from '\.\.\/composables\/useMediaPreview'/)
    assert.match(source, /const \{ setLightboxSources \} = useMediaPreview\(\)/)
    assert.match(
        source,
        /collectSessionImageSources\(processedMessages\.value, settingsStore\.apiBaseUrl\)/,
    )
    assert.match(source, /sources => setLightboxSources\(sources\)/)
    assert.match(source, /setLightboxSources\(\[\]\)/)
})
