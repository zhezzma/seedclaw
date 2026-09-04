<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from './MarkdownRenderer.vue'

/**
 * 思考过程（thinking）折叠块。
 *
 * 性能关键设计：
 * - 折叠时内容用 v-if 完全不挂载（DaisyUI collapse 仅视觉隐藏，内容仍会全量渲染，
 *   长思考历史每次进视口都触发 markdown-it 全量渲染，是页面卡顿的主因）。
 * - 流式进行中（streaming）展开时显示纯文本：文本增量 patch 几乎零成本，
 *   避免 MarkdownRenderer 对整个累积文本做 O(n²) 重渲；
 *   流结束后切换 MarkdownRenderer 一次性渲染，之后静态不再变化。
 *   定格判定由父组件完成：thinking 块后面还有其他 block → 已定格；
 *   它是最后一个 block 且本轮 turn 仍在忙 → 仍在增长。
 */
const props = defineProps<{
    text: string
    /** 该思考块是否仍处于流式增长中 */
    streaming?: boolean
}>()

const { t } = useI18n()
const expanded = ref(false)
// 直播容器引用：流式期间文本增长时自动跟随滚动
const liveElement = ref<HTMLElement | null>(null)

// 已知间隙（不修，记录在此）：streaming 判定为「最后一个 block 且 turn 仍在忙」，
// 在多 phase 协议（thinking 的 message_end 后、下一 phase 首个事件前）存在秒级窗口，
// 此时思考已定格但 streaming 仍为 true：标题 loading-dots 短暂闪动、展开显示纯文本，
// 下一个 block 到达后自动切回 markdown 渲染，内容无损。

const toggle = () => {
    expanded.value = !expanded.value
}

// 按住 Enter/Space（keydown 自动重复）不应连续翻转展开状态
const onToggleKeydown = (e: KeyboardEvent) => {
    if (e.repeat) return
    toggle()
}

// 用 rAF 合并一帧内的多次滚到底部：流式热路径每个 delta 都会走到这里，
// 若每 delta 直接读布局+写 scrollTop 会造成强制 reflow 且高频 delta 下重复滚动；
// rAF 回调天然合并同帧多次调度，一帧最多滚一次
let followRafId = 0
const scrollToBottom = () => {
    if (followRafId) return
    followRafId = requestAnimationFrame(() => {
        followRafId = 0
        const el = liveElement.value
        if (el) el.scrollTop = el.scrollHeight
    })
}

// 展开瞬间定位到最新内容：直播跟随本来就是"看最新"，从顶部看起不符合预期
watch(expanded, (open) => {
    if (open && props.streaming) {
        scrollToBottom()
    }
})

// 直播自动跟随：仅当用户停留在底部附近（<60px，与 SubagentTraceDrawer/useScrollManager
// 同阈值）才跟随；用户向上回看时不强制拉底，滚回底部后自动恢复跟随。
// 时序注意：本 watch 为 pre-flush，回调触发时 DOM 尚未插入最新文本，此刻测距才准确；
// 若在 nextTick 后（内容已长高）再测，恰好位于底部的用户会被误判为"不在底部"而停止跟随。
watch(() => props.text, () => {
    if (!props.streaming || !expanded.value) return
    const el = liveElement.value
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight >= 60) return
    scrollToBottom()
})
</script>

<template>
    <div class="my-2 collapse collapse-arrow border border-base-300 bg-base-100 rounded-box"
        :class="{ 'collapse-open': expanded }">
        <!-- role=button 使键盘用户（Tab/Enter/Space）也能切换展开 -->
        <div role="button" tabindex="0"
            class="collapse-title text-sm font-medium opacity-70 flex items-center gap-2 cursor-pointer select-none"
            :aria-expanded="expanded" @click="toggle" @keydown.enter.prevent="onToggleKeydown"
            @keydown.space.prevent="onToggleKeydown">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <!-- 流式进行中用加载动画提示，结束后为静态标题 -->
            <span v-if="streaming" class="loading loading-dots loading-xs" aria-hidden="true"></span>
            {{ t('chat.reasoning') }}
        </div>
        <!-- 折叠时内容完全不挂载，彻底避免 markdown 全量渲染 -->
        <div v-if="expanded" class="collapse-content">
            <!-- 流式中：纯文本直播（增量 patch 成本极低） -->
            <div v-if="streaming" ref="liveElement"
                class="opacity-80 text-sm border-t border-base-300 pt-2 mt-2 whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto">
                {{ text }}
            </div>
            <!-- 已定格：markdown 一次性渲染，之后内容不变 -->
            <div v-else class="opacity-80 text-sm border-t border-base-300 pt-2 mt-2">
                <MarkdownRenderer :content="text" />
            </div>
        </div>
    </div>
</template>
