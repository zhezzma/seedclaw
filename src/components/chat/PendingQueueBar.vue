<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDownIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import type { PendingItem } from '../../utils/pending-queue'

defineProps<{
    /** 当前会话的排队条目（空数组时不渲染） */
    items: PendingItem[]
}>()

const emit = defineEmits<{
    (e: 'remove', id: string): void
}>()

const { t } = useI18n()
const expanded = ref(false)
</script>

<template>
    <!-- busy 期间 steer/follow-up 的排队提示条：挂在会话页输入框上方，队列非空才显示 -->
    <div v-if="items.length > 0" class="border-t border-base-300/60 bg-base-100 px-4 py-1 text-xs select-none">
        <div class="mx-auto w-full max-w-3xl">
            <button type="button"
                class="flex w-full items-center gap-1.5 py-0.5 text-left text-base-content/70 hover:text-base-content transition-colors"
                @click="expanded = !expanded">
                <span aria-hidden="true">⏳</span>
                <span class="font-medium">{{ t('chat.pendingQueue.count', { n: items.length }) }}</span>
                <span class="text-base-content/40 truncate">· {{ t('chat.pendingQueue.hint') }}</span>
                <ChevronDownIcon class="ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200"
                    :class="{ 'rotate-180': expanded }" />
            </button>
            <!-- 展开后逐条预览；✕ 请求服务端从队列删除该条（真删除，消息不再发送），按响应快照对齐本地 -->
            <div v-if="expanded" class="flex flex-col gap-1 pb-1.5 pt-1">
                <div v-for="item in items" :key="item.id"
                    class="flex items-center gap-2 rounded-lg border border-base-300/50 bg-base-200/60 px-2 py-1">
                    <span class="badge badge-ghost badge-xs shrink-0 font-normal">
                        {{ item.mode === 'follow' ? t('chat.pendingQueue.followBadge') : t('chat.pendingQueue.steerBadge') }}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-base-content/70" :title="item.text">{{ item.text }}</span>
                    <button type="button"
                        class="btn btn-ghost btn-xs btn-circle shrink-0 text-base-content/50 hover:text-error"
                        :title="t('chat.pendingQueue.removeHint')" @click="emit('remove', item.id)">
                        <XMarkIcon class="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
