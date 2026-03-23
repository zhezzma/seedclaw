import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/chat/MessageBubble.vue')
const source = readFileSync(componentPath, 'utf8')

const getSection = (startMarker: string, endMarker: string) => {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    assert.notEqual(start, -1, `missing section start: ${startMarker}`)
    assert.notEqual(end, -1, `missing section end: ${endMarker}`)
    return source.slice(start, end)
}

const assertRetryBeforeDelete = (section: string, name: string) => {
    const retryIndex = section.indexOf(":title=\"$t('chat.retry')\"")
    const deleteIndex = section.indexOf(":title=\"$t('common.delete')\"")

    assert.notEqual(retryIndex, -1, `${name} section should contain retry button`)
    assert.notEqual(deleteIndex, -1, `${name} section should contain delete button`)
    assert.ok(retryIndex < deleteIndex, `${name} toolbar should place retry before delete`)
}

test('user toolbar places retry button before delete button', () => {
    const section = getSection('<!-- User Actions (Hover) -->', '<!-- Assistant Message Bubble -->')
    assertRetryBeforeDelete(section, 'user')
})

test('assistant toolbar places retry button before delete button', () => {
    const section = getSection('<!-- Assistant Actions (Fixed) -->', '<!-- Branch Navigation -->')
    assertRetryBeforeDelete(section, 'assistant')
})
