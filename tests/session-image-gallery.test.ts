import test from 'node:test'
import assert from 'node:assert/strict'
import type { DisplayMessage } from '../src/composables/useChatMessages.ts'
import { collectSessionImageSources } from '../src/utils/session-image-gallery.ts'

const messages: DisplayMessage[] = [
    {
        id: 'user-1',
        role: 'user',
        blocks: [
            {
                type: 'text',
                text: '![first](/media/first.png)\n![second](https://cdn.example.com/second.jpg)',
            },
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/webp',
                    data: 'AAAA',
                },
            },
        ],
    },
    {
        id: 'assistant-1',
        role: 'assistant',
        blocks: [
            {
                type: 'thinking',
                text: '![third](media/third.png)',
            },
            {
                type: 'image',
                source: {
                    type: 'url',
                    url: 'https://cdn.example.com/second.jpg',
                },
            },
            {
                type: 'tool',
                toolName: 'ignored',
            },
        ],
    },
]

test('collects structured, Markdown, and thinking images in display order', () => {
    assert.deepEqual(
        collectSessionImageSources(messages, 'https://api.example.com/'),
        [
            'https://api.example.com/media/first.png',
            'https://cdn.example.com/second.jpg',
            'data:image/webp;base64,AAAA',
            'https://api.example.com/media/third.png',
        ],
    )
})

test('keeps only the first occurrence of a repeated image URL', () => {
    const repeated: DisplayMessage[] = [
        {
            id: 'assistant-2',
            role: 'assistant',
            blocks: [
                { type: 'text', text: '![one](https://example.com/a.png)' },
                {
                    type: 'image',
                    source: { type: 'url', url: 'https://example.com/a.png' },
                },
            ],
        },
    ]

    assert.deepEqual(
        collectSessionImageSources(repeated, ''),
        ['https://example.com/a.png'],
    )
})

test('returns an empty gallery when messages have no rendered images', () => {
    assert.deepEqual(
        collectSessionImageSources([
            {
                id: 'assistant-3',
                role: 'assistant',
                blocks: [{ type: 'text', text: 'plain text' }],
            },
        ], ''),
        [],
    )
})
