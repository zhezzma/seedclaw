import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/agents/tabs/AgentOverview.vue')
const source = readFileSync(componentPath, 'utf8')

test('agent overview reuses the shared model menu content component instead of a native select', () => {
    assert.match(
        source,
        /import ModelSelectMenuContent from /,
        'AgentOverview should import the shared model menu content component',
    )

    assert.match(
        source,
        /const modelDropdownOpen = ref\(false\)/,
        'AgentOverview should manage its own model dropdown open state',
    )

    assert.match(
        source,
        /<ModelSelectMenuContent[\s\S]*@select="handleAgentModelSelect"/s,
        'AgentOverview should render the shared model menu content component and wire it to a local select handler',
    )

    assert.doesNotMatch(
        source,
        /<select v-model="currentModel"/,
        'AgentOverview should no longer use a native select for model selection',
    )
})

test('agent overview basic info card keeps dropdowns visible outside the card bounds', () => {
    assert.match(
        source,
        /class="card bg-base-100 shadow-sm overflow-visible"/,
        'AgentOverview should avoid clipping the shared model dropdown with overflow-hidden',
    )
})

test('agent overview model dropdown computes mobile fixed positioning from the trigger rect while still opening upward', () => {
    assert.match(
        source,
        /const modelTriggerRef = ref<HTMLElement \| null>\(null\)/,
        'AgentOverview should keep a ref to the trigger button for positioning calculations',
    )

    assert.match(
        source,
        /window\.innerHeight - rect\.top \+ 8/,
        'AgentOverview should compute a mobile bottom offset from the trigger top so the popup opens upward',
    )

    assert.match(
        source,
        /:style="modelDropdownStyle"/,
        'AgentOverview should bind the computed mobile popup position as inline style',
    )

    assert.match(
        source,
        /class="fixed left-4 right-4 shadow-xl bg-base-100 rounded-box border border-base-300 z-\[120\] max-h-\[50vh\] overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:bottom-full sm:mb-2 sm:w-\[22rem\] sm:max-w-\[calc\(100vw-2rem\)\]"/,
        'AgentOverview should use mobile fixed positioning and switch to desktop absolute upward positioning on larger screens',
    )
})
