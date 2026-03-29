import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')
const source = readFileSync(componentPath, 'utf8')

const modelSectionStart = '<!-- Model -->'
const modelSectionEnd = '</div>\n\n\n\n                    <!-- Thinking Level -->'
const start = source.indexOf(modelSectionStart)
const end = source.indexOf(modelSectionEnd, start)

assert.notEqual(start, -1, 'missing model dropdown section start marker')
assert.notEqual(end, -1, 'missing model dropdown section end marker')

const modelSection = source.slice(start, end)

test('model dropdown places the selected check icon on the right side', () => {
    assert.match(
        modelSection,
        /m\.name[\s\S]*<CheckIcon\s+v-if="currentModel === `\$\{group\.provider\}\/\$\{m\.id\}`"\s+class="h-4 w-4 shrink-0"\s*\/>/s,
        'model dropdown should render the selected check icon after the model label so it appears on the right side',
    )

    assert.match(
        modelSection,
        /m\.name[\s\S]*<span\s+v-else\s+class="w-4 h-4 shrink-0"><\/span>/s,
        'model dropdown should keep a right-side placeholder for unselected items so labels stay aligned',
    )
})
