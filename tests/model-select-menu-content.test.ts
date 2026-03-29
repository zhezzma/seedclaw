import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/models/ModelSelectMenuContent.vue')
const source = readFileSync(componentPath, 'utf8')

test('model select menu content exposes grouped search and unknown-current rendering', () => {
    assert.match(source, /const searchText = ref\(''\)/)
    assert.match(source, /m\.name/)
    assert.match(source, /m\.id/)
    assert.match(source, /filteredGroups/)
    assert.match(source, /unknownCurrent/)
    assert.match(source, /defineEmits/)
})

test('model select menu content renders grouped search UI and emits full model ids', () => {
    assert.match(source, /v-model="searchText"/)
    assert.match(source, /provider\.selectModel/)
    assert.match(source, /provider\.searchModels/)
    assert.match(source, /emit\('select', `\$\{provider\}\/\$\{modelId\}`\)/)
    assert.match(source, /v-for="group in filteredGroups"/)
    assert.match(source, /bg-primary\/10 text-primary/)
    assert.match(source, /<CheckIcon/)
    assert.match(source, /<MagnifyingGlassIcon/)
})

test('model select menu content keeps sticky header controls separate from the scrolling list', () => {
    assert.match(source, /class="flex max-h-full min-h-0 flex-col"/)
    assert.match(source, /class="sticky top-0 z-20 bg-base-100"/)
    assert.match(source, /class="min-h-0 overflow-y-auto px-2 pb-2"/)
    assert.match(source, /text-\[10px\] uppercase tracking-wider bg-base-200\/50 mb-1 font-bold block sticky top-0 backdrop-blur-md z-10/)
})
