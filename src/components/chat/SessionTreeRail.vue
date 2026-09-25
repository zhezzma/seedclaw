<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SessionTreeItem } from '../../utils/sessionTreeItems'

/**
 * 桌面端（lg+）会话页左侧的 session tree minimap：
 * 每条 user / 合并后 AI 气泡一根短横，加粗短横 = 视口正在看的消息（滚动跟随），
 * hover 浮出预览卡，点击跳转到对应气泡。数据与消息气泡 1:1（buildSessionTreeItems），
 * 跳转复用 HomeView 的 handleJumpToTreeEntry。
 */

const props = defineProps<{
    items: SessionTreeItem[]
    /** 视口中心命中的消息 entryId（VirtualMessageList 暴露） */
    activeEntryId?: string | null
}>()

const emit = defineEmits<{
    (e: 'jump-to-entry', entryId: string): void
}>()

const railEl = ref<HTMLElement | null>(null)

/** 预览卡时间：当天 HH:mm，非今天 M/D HH:mm（与 MessageBubble 的 HH:mm 口径一致） */
const formatCardTime = (timestamp?: number): string => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const hm = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    const today = new Date()
    if (date.toDateString() === today.toDateString()) return hm
    return `${date.getMonth() + 1}/${date.getDate()} ${hm}`
}

/** AI 项的悬浮卡标题 = 触发本轮的 user 输入（截图卡片的「问题 + 回复」样式） */
const cards = computed(() => {
    let lastUserPreview = ''
    return props.items.map(item => {
        const card = {
            ...item,
            title: item.type === 'ai' ? lastUserPreview : '',
        }
        if (item.type === 'user') lastUserPreview = item.preview
        return card
    })
})

// ---- hover 预览卡 ----
// 卡片 Teleport 到 body 用 fixed 定位：rail 滚动容器是 overflow-y-auto，
// absolute 定位在容器外侧的卡片会被裁剪，无法挂在短横元素内部。
const hoveredIndex = ref<number | null>(null)
const cardStyle = ref<{ left: string; top: string }>({ left: '0px', top: '0px' })
// 估算卡片半高，把锚点夹在视口内防贴边溢出
const CARD_HALF_ESTIMATE = 110

const showCard = (index: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const centerY = Math.min(
        Math.max(rect.top + rect.height / 2, CARD_HALF_ESTIMATE),
        window.innerHeight - CARD_HALF_ESTIMATE,
    )
    cardStyle.value = { left: `${rect.right + 12}px`, top: `${centerY}px` }
    hoveredIndex.value = index
}

const hideCard = () => {
    hoveredIndex.value = null
}

// 当前项变化时把对应短横滚入 rail 可视区（block:'nearest' 只在出界时滚动）
watch(
    () => props.activeEntryId,
    async (id) => {
        if (!id || !railEl.value) return
        await new Promise(resolve => requestAnimationFrame(resolve))
        const index = props.items.findIndex(item => item.jumpEntryId === id)
        if (index < 0) return
        railEl.value
            .querySelectorAll<HTMLElement>('[data-dash]')
            [index]?.scrollIntoView({ block: 'nearest' })
    },
)
</script>

<template>
    <nav
        class="pointer-events-none absolute left-1 top-3 bottom-3 z-20 hidden w-7 lg:flex flex-col items-center"
        :aria-label="$t('chat.sessionTreeTitle')">
        <!-- my-auto：内容少时垂直居中，超出时回退顶部对齐 + 内部滚动（auto margin 归零，不会裁掉顶部） -->
        <!-- 行高 h-4：提供充裕的 hover / 点击命中区；横线视觉高度由内部 span 决定（3-4px）不变。
             gap 归零保持原有行密度（原 10px 行 + 5px 间隙 ≈ 16px 节距） -->
        <div ref="railEl" class="rail-scroll pointer-events-auto my-auto flex flex-col items-center py-2 overflow-y-auto">
            <div v-for="(card, i) in cards" :key="card.jumpEntryId"
                class="group relative flex h-4 w-7 items-center justify-center" data-dash
                @mouseenter="showCard(i, $event.currentTarget as HTMLElement)" @mouseleave="hideCard">
                <button type="button" class="flex h-full w-full items-center justify-center cursor-pointer"
                    :aria-label="card.preview || $t('chat.sessionTreeTitle')"
                    @click="emit('jump-to-entry', card.jumpEntryId)">
                    <span class="rounded-full transition-all duration-150"
                        :class="[
                            card.type === 'user' ? 'h-[3px] w-2.5' : 'h-[3px] w-4',
                            card.jumpEntryId === activeEntryId
                                ? 'h-[4px] w-5 bg-base-content'
                                : 'bg-base-content/20 group-hover:bg-base-content/50',
                        ]"></span>
                </button>
            </div>
        </div>
    </nav>

    <!-- hover 预览卡（Teleport 到 body，避免被 rail 的 overflow 裁剪）；
         user 蓝色 / AI 绿色，与 SessionTreeModal 的 role 配色一致 -->
    <Teleport to="body">
        <div v-if="hoveredIndex !== null && cards[hoveredIndex]" class="fixed z-[100] -translate-y-1/2
                w-72 max-w-[320px] rounded-xl border border-base-content/10 bg-base-200
                p-3 shadow-xl border-l-4"
            :class="cards[hoveredIndex].type === 'user' ? 'border-l-info' : 'border-l-success'"
            :style="cardStyle">
            <span class="mb-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="cards[hoveredIndex].type === 'user' ? 'bg-info/15 text-info' : 'bg-success/15 text-success'">
                {{ cards[hoveredIndex].type === 'user' ? 'user' : 'AI' }}
            </span>
            <span v-if="cards[hoveredIndex].timestamp"
                class="mb-1.5 ml-2 inline-block text-[10px] text-base-content/40">
                {{ formatCardTime(cards[hoveredIndex].timestamp) }}
            </span>
            <p v-if="cards[hoveredIndex].title" class="mb-1 text-sm font-semibold text-base-content line-clamp-2">
                {{ cards[hoveredIndex].title }}
            </p>
            <p class="text-[13px] leading-5 text-base-content/60 line-clamp-6 whitespace-pre-wrap">
                {{ cards[hoveredIndex].preview }}
            </p>
        </div>
    </Teleport>
</template>

<style scoped>
.rail-scroll {
    scrollbar-width: none;
}

.rail-scroll::-webkit-scrollbar {
    display: none;
}
</style>
