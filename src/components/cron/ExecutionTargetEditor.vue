<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { TaskExecutionTarget } from '@/utils/cron-execution-target'
import type { SessionSearchCandidate } from '@/utils/cron-session-search'
import { mergeExecutionTargetCandidates } from '@/utils/cron-session-search'

const props = defineProps<{
  modelValue: TaskExecutionTarget
  agents: Array<{ id: string; name: string }>
  cachedCandidates: SessionSearchCandidate[]
  remoteSearch: (query: string, limit?: number) => Promise<SessionSearchCandidate[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TaskExecutionTarget]
}>()

const searchText = ref('')
const remoteCandidates = ref<SessionSearchCandidate[]>([])
const loading = ref(false)

const mode = computed({
  get: () => props.modelValue.type,
  set: (value: 'newSession' | 'existingSession') => {
    if (value === 'newSession') {
      emit('update:modelValue', { type: 'newSession', agentId: props.agents[0]?.id || '' })
      return
    }
    emit('update:modelValue', { type: 'existingSession', sessionId: '' })
  },
})

const mergedCandidates = computed(() => mergeExecutionTargetCandidates(
  props.cachedCandidates,
  remoteCandidates.value,
  searchText.value,
  10,
))

watch(searchText, async (value) => {
  if (mode.value !== 'existingSession') return
  loading.value = true
  try {
    remoteCandidates.value = await props.remoteSearch(value, 10)
  } finally {
    loading.value = false
  }
}, { immediate: true })

const updateAgentId = (agentId: string) => {
  emit('update:modelValue', { type: 'newSession', agentId })
}

const updateSessionId = (sessionId: string) => {
  emit('update:modelValue', {
    type: 'existingSession',
    sessionId,
    sessionName: mergedCandidates.value.find(item => item.id === sessionId)?.name,
    sessionCategory: mergedCandidates.value.find(item => item.id === sessionId)?.sessionCategory,
  })
}
</script>

<template>
  <div class="space-y-4">
    <div class="form-control">
      <label class="label"><span class="label-text">执行目标</span></label>
      <div class="join w-full">
        <button type="button" class="join-item btn flex-1" :class="mode === 'newSession' ? 'btn-primary' : 'btn-outline'" @click="mode = 'newSession'">新建会话</button>
        <button type="button" class="join-item btn flex-1" :class="mode === 'existingSession' ? 'btn-primary' : 'btn-outline'" @click="mode = 'existingSession'">复用会话</button>
      </div>
    </div>

    <div v-if="mode === 'newSession'" class="form-control w-full">
      <label class="label"><span class="label-text">Agent</span></label>
      <select class="select select-bordered w-full" :value="modelValue.type === 'newSession' ? modelValue.agentId : ''" @change="updateAgentId(($event.target as HTMLSelectElement).value)">
        <option value="">选择 Agent</option>
        <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
      </select>
    </div>

    <div v-else class="space-y-3">
      <div class="form-control w-full">
        <label class="label"><span class="label-text">Session ID</span></label>
        <input
          class="input input-bordered w-full"
          :value="modelValue.type === 'existingSession' ? modelValue.sessionId : ''"
          placeholder="输入 sessionId 或通过下面搜索选择"
          @input="updateSessionId(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="form-control w-full">
        <label class="label"><span class="label-text">搜索会话</span></label>
        <input v-model="searchText" class="input input-bordered w-full" placeholder="按名称或 ID 搜索，最多显示 10 条" />
        <label class="label" v-if="loading"><span class="label-text-alt">搜索中…</span></label>
      </div>

      <div class="rounded-lg border border-base-300 divide-y divide-base-300 overflow-hidden">
        <button
          v-for="candidate in mergedCandidates"
          :key="candidate.id"
          type="button"
          class="w-full px-3 py-2 text-left hover:bg-base-200"
          @click="updateSessionId(candidate.id)"
        >
          <div class="font-medium truncate">{{ candidate.name || candidate.id }}</div>
          <div class="text-xs opacity-60 flex items-center justify-between gap-2">
            <span class="truncate">{{ candidate.id }}</span>
            <span>{{ candidate.sessionCategory === 'task' ? '任务会话' : '默认会话' }}</span>
          </div>
        </button>
        <div v-if="mergedCandidates.length === 0" class="px-3 py-2 text-sm opacity-60">暂无候选会话</div>
      </div>
    </div>
  </div>
</template>
