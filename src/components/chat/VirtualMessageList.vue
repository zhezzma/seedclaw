<script setup lang="ts">
import {
    ref,
    computed,
    watch,
    onMounted,
    onBeforeUnmount,
    nextTick,
} from 'vue'
import type { DisplayMessage } from '../../composables/useChatMessages'
import type { BranchInfo } from './MessageBubble.vue'
import MessageBubble from './MessageBubble.vue'

// ──────────────────────────────────────────────────────────────────────────
// Props / Emits
// ──────────────────────────────────────────────────────────────────────────
const props = defineProps<{
    messages: DisplayMessage[]
    isBusy: boolean
    scrollContainer: HTMLElement | null
    isWideMode: boolean
    getBranchInfo: (msg: DisplayMessage) => BranchInfo | null
}>()

const emit = defineEmits<{
    (e: 'copy', msg: DisplayMessage): void
    (e: 'read-aloud', msg: DisplayMessage): void
    (e: 'delete', msg: DisplayMessage): void
    (e: 'retry', msg: DisplayMessage): void
    (e: 'edit', msg: DisplayMessage, newText: string): void
    (e: 'navigate-branch', msg: DisplayMessage, dir: 'prev' | 'next'): void
}>()

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────
// Extra pixels outside the viewport to keep rendered (top & bottom)
const OVERSCAN_PX = 1200
// Row bottom padding (replaces CSS gap so ResizeObserver can measure the full slot height)
const ROW_GAP = 16 // px – equivalent to space-y-4 / gap-4
// Estimated height for a message before it has been measured
const ESTIMATED_HEIGHT = 120 + ROW_GAP

// ──────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────
/**
 * Measured height (content + ROW_GAP padding) for each item, keyed by the
 * item's stable key.  Uses a plain object for fast reactive access.
 */
const heights = ref<Record<string, number>>({})

/** Set of item keys that are currently mounted (within overscan window) */
const visibleKeys = ref<Set<string>>(new Set())

/** ResizeObserver that watches every mounted row */
let ro: ResizeObserver | null = null

// Map: key → DOM element
const rowEls = new Map<string, HTMLElement>()

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
const itemKey = (msg: DisplayMessage, index: number) =>
    msg.entryId ?? `idx-${index}`

const getHeight = (key: string): number =>
    heights.value[key] ?? ESTIMATED_HEIGHT

// ──────────────────────────────────────────────────────────────────────────
// Enriched items list
// ──────────────────────────────────────────────────────────────────────────
const enrichedItems = computed(() =>
    props.messages.map((msg, i) => ({
        msg,
        key: itemKey(msg, i),
        index: i,
        isLast: i === props.messages.length - 1,
    }))
)

// ──────────────────────────────────────────────────────────────────────────
// Visibility computation
// ──────────────────────────────────────────────────────────────────────────
const updateVisibleRange = () => {
    const container = props.scrollContainer

    if (!container) {
        // No container yet – render everything as fallback
        visibleKeys.value = new Set(enrichedItems.value.map(i => i.key))
        return
    }

    const scrollTop = container.scrollTop
    const clientHeight = container.clientHeight
    const winTop = scrollTop - OVERSCAN_PX
    const winBottom = scrollTop + clientHeight + OVERSCAN_PX

    const next = new Set<string>()
    let accum = 0

    for (const item of enrichedItems.value) {
        const h = getHeight(item.key)
        const top = accum
        const bottom = accum + h

        if (bottom > winTop && top < winBottom) {
            next.add(item.key)
        }

        // Always keep the last item rendered (streaming / loading indicator)
        if (item.isLast) next.add(item.key)

        accum += h
    }

    visibleKeys.value = next
}

// ──────────────────────────────────────────────────────────────────────────
// ResizeObserver – measure actual row heights
// ──────────────────────────────────────────────────────────────────────────
const setupRO = () => {
    ro = new ResizeObserver(entries => {
        let changed = false
        for (const entry of entries) {
            const key = (entry.target as any).__vl_key as string | undefined
            if (!key) continue

            // Use borderBoxSize (includes padding) so the measured value equals
            // the full vertical space the row occupies in the layout.
            const newH =
                entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height

            if (newH > 0 && heights.value[key] !== newH) {
                heights.value[key] = newH
                changed = true
            }
        }
        if (changed) updateVisibleRange()
    })
}

const observeEl = (el: HTMLElement, key: string) => {
    ; (el as any).__vl_key = key
    ro?.observe(el)
}

const unobserveEl = (el: HTMLElement) => {
    ro?.unobserve(el)
}

// ──────────────────────────────────────────────────────────────────────────
// Template ref callback (called by Vue for each v-if row)
// ──────────────────────────────────────────────────────────────────────────
const setRowRef = (key: string) => (el: Element | null) => {
    if (el instanceof HTMLElement) {
        rowEls.set(key, el)
        observeEl(el, key)
    } else {
        const old = rowEls.get(key)
        if (old) {
            unobserveEl(old)
            rowEls.delete(key)
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Scroll container wiring
// ──────────────────────────────────────────────────────────────────────────
const attachScroll = (el: HTMLElement | null) => {
    el?.addEventListener('scroll', updateVisibleRange, { passive: true })
}
const detachScroll = (el: HTMLElement | null) => {
    el?.removeEventListener('scroll', updateVisibleRange)
}

watch(
    () => props.scrollContainer,
    (newEl, oldEl) => {
        detachScroll(oldEl ?? null)
        attachScroll(newEl ?? null)
        nextTick(updateVisibleRange)
    }
)

// Re-compute whenever message list changes: length OR any key change
// (streaming end causes the last message's key to flip from idx-N → real entryId)
// Also migrate measured heights from old key → new key to keep positions accurate.
let prevKeys: string[] = []
watch(
    () => enrichedItems.value.map(i => i.key),
    (newKeys) => {
        // If same length, check for key changes at the same index (key migration)
        if (prevKeys.length === newKeys.length) {
            for (let i = 0; i < newKeys.length; i++) {
                if (prevKeys[i] !== newKeys[i]) {
                    const oldH = heights.value[prevKeys[i]]
                    if (oldH !== undefined) {
                        heights.value[newKeys[i]] = oldH
                        delete heights.value[prevKeys[i]]
                    }
                }
            }
        }
        prevKeys = newKeys
        nextTick(updateVisibleRange)
    }
)

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────
onMounted(() => {
    setupRO()
    attachScroll(props.scrollContainer)
    nextTick(updateVisibleRange)
})

onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
    detachScroll(props.scrollContainer)
})
</script>

<template>
    <!--
        Each row is a plain div with padding-bottom (= ROW_GAP).
        ResizeObserver uses borderBoxSize, so it captures content + padding,
        giving us accurate cumulative positions for the visibility check.

        Off-screen rows are replaced by a spacer div with the last measured height.
    -->
    <div class="virtual-message-list">
        <template v-for="item in enrichedItems" :key="item.key">
            <!-- Mounted row -->
            <div v-if="visibleKeys.has(item.key)" :ref="setRowRef(item.key) as any" class="virtual-row" :data-key="item.key">
                <MessageBubble :message="item.msg" :is-loading="isBusy && item.isLast" :is-busy="isBusy"
                    :is-last-message="item.isLast"
                    :branch-info="getBranchInfo(item.msg)" @copy="emit('copy', item.msg)"
                    @read-aloud="emit('read-aloud', item.msg)" @delete="emit('delete', item.msg)"
                    @retry="emit('retry', item.msg)" @edit="(msg, text) => emit('edit', msg, text)"
                    @navigate-branch="(msg, dir) => emit('navigate-branch', msg, dir)" />
            </div>

            <!-- Spacer: keeps scroll height stable while the row is unmounted -->
            <div v-else class="virtual-spacer" :style="{ height: getHeight(item.key) + 'px' }" />
        </template>
    </div>
</template>

<style scoped>
.virtual-message-list {
    display: flex;
    flex-direction: column;
}

/*
  padding-bottom on each row creates the inter-row gap.
  Because we use padding (not gap/margin), borderBoxSize in ResizeObserver
  captures the full vertical slot the row occupies.
*/
.virtual-row {
    padding-bottom: 16px;
    /* ROW_GAP – keep in sync with the constant */
}

.virtual-spacer {
    flex-shrink: 0;
}
</style>
