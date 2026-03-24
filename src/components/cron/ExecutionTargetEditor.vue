<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDownIcon, XMarkIcon } from '@heroicons/vue/24/outline'

import type { TaskExecutionTarget } from '@/utils/cron-execution-target'
import type { SessionSearchCandidate } from '@/utils/cron-session-search'
import { mergeExecutionTargetCandidates } from '@/utils/cron-session-search'
import {
  findExactSessionCandidate,
  findSessionCandidateById,
  formatSessionCandidateDisplay,
  getSessionInputUiState,
  shouldAutoSelectSessionInput,
} from '@/utils/cron-session-select'

const props = defineProps<{
  modelValue: TaskExecutionTarget
  agents: Array<{ id: string; name: string }>
  cachedCandidates: SessionSearchCandidate[]
  remoteSearch: (query: string, limit?: number) => Promise<SessionSearchCandidate[]>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TaskExecutionTarget]
  validityChange: [valid: boolean]
}>()

const remoteCandidates = ref<SessionSearchCandidate[]>([])
const loading = ref(false)
const inputText = ref('')
const dropdownOpen = ref(false)
const editingText = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
let searchToken = 0

const mode = computed({
  get: () => props.modelValue.type,
  set: (value: 'newSession' | 'existingSession') => {
    remoteCandidates.value = []
    inputText.value = ''
    dropdownOpen.value = false
    editingText.value = false
    if (value === 'newSession') {
      emit('update:modelValue', { type: 'newSession', agentId: props.agents[0]?.id || '' })
      emit('validityChange', true)
      return
    }
    emit('update:modelValue', { type: 'existingSession', sessionId: '' })
    emit('validityChange', false)
  },
})

const allKnownCandidates = computed(() => mergeExecutionTargetCandidates(
  props.cachedCandidates,
  remoteCandidates.value,
  editingText.value ? inputText.value : '',
  Math.max(props.cachedCandidates.length + remoteCandidates.value.length, 10),
))

const mergedCandidates = computed(() => allKnownCandidates.value.slice(0, 10))

const selectedCandidate = computed(() => {
  if (props.modelValue.type !== 'existingSession') return undefined
  return findSessionCandidateById(allKnownCandidates.value, props.modelValue.sessionId)
    || findSessionCandidateById(props.cachedCandidates, props.modelValue.sessionId)
    || findSessionCandidateById(remoteCandidates.value, props.modelValue.sessionId)
})

const hasValue = computed(() => {
  if (mode.value !== 'existingSession') return false
  return Boolean(inputText.value.trim() || (props.modelValue.type === 'existingSession' && props.modelValue.sessionId.trim()))
})

const selectedSessionValid = computed(() => {
  if (props.modelValue.type !== 'existingSession') return true
  return Boolean(findExactSessionCandidate(allKnownCandidates.value, props.modelValue.sessionId))
})

const sessionInputUiState = computed(() => getSessionInputUiState({
  loading: loading.value,
  hasInputText: Boolean(inputText.value.trim()),
  selectedSessionValid: selectedSessionValid.value,
}))

const syncInputTextFromModel = () => {
  if (mode.value !== 'existingSession' || editingText.value) return
  inputText.value = formatSessionCandidateDisplay(selectedCandidate.value)
}

const syncValidity = () => {
  emit('validityChange', selectedSessionValid.value)
}

watch(() => props.modelValue, () => {
  syncInputTextFromModel()
  syncValidity()
}, { immediate: true, deep: true })

watch(mergedCandidates, () => {
  syncInputTextFromModel()
  syncValidity()
}, { deep: true })

watch(() => mode.value, async (value) => {
  if (value !== 'existingSession') return
  loading.value = true
  const currentToken = ++searchToken
  try {
    const results = await props.remoteSearch('', 10)
    if (currentToken === searchToken) {
      remoteCandidates.value = results
    }
  } finally {
    if (currentToken === searchToken) {
      loading.value = false
      syncInputTextFromModel()
      syncValidity()
    }
  }
}, { immediate: true })

watch(inputText, async (value) => {
  if (mode.value !== 'existingSession' || !editingText.value) return
  loading.value = true
  const currentToken = ++searchToken
  try {
    const results = await props.remoteSearch(value, 10)
    if (currentToken === searchToken) {
      remoteCandidates.value = results
    }
  } finally {
    if (currentToken === searchToken) {
      loading.value = false
      syncValidity()
    }
  }
})

const updateAgentId = (agentId: string) => {
  emit('update:modelValue', { type: 'newSession', agentId })
  emit('validityChange', true)
}

const applySessionCandidate = (candidate?: SessionSearchCandidate) => {
  emit('update:modelValue', {
    type: 'existingSession',
    sessionId: candidate?.id || '',
    sessionName: candidate?.name,
    sessionCategory: candidate?.sessionCategory,
  })
  editingText.value = false
  inputText.value = formatSessionCandidateDisplay(candidate)
  dropdownOpen.value = false
  syncValidity()
}

const handleInputFocus = async () => {
  if (mode.value !== 'existingSession') return
  dropdownOpen.value = true
  if (props.modelValue.type === 'existingSession' && props.modelValue.sessionId) {
    editingText.value = true
    inputText.value = props.modelValue.sessionId
    await nextTick()
    const canAutoSelect = shouldAutoSelectSessionInput({
      maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
      coarsePointer: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false,
    })
    if (canAutoSelect) {
      inputRef.value?.select()
    }
    return
  }
  editingText.value = true
}

const handleInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  editingText.value = true
  dropdownOpen.value = true
  inputText.value = value

  const exactCandidate = findExactSessionCandidate(mergedCandidates.value, value)
  if (exactCandidate) {
    emit('update:modelValue', {
      type: 'existingSession',
      sessionId: exactCandidate.id,
      sessionName: exactCandidate.name,
      sessionCategory: exactCandidate.sessionCategory,
    })
  } else {
    emit('update:modelValue', {
      type: 'existingSession',
      sessionId: value.trim(),
    })
  }
  syncValidity()
}

const handleInputBlur = () => {
  window.setTimeout(() => {
    dropdownOpen.value = false
    editingText.value = false
    syncInputTextFromModel()
  }, 120)
}

const clearSelection = async () => {
  applySessionCandidate(undefined)
  editingText.value = true
  dropdownOpen.value = true
  await nextTick()
  inputRef.value?.focus()
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

    <div v-else class="space-y-2">
      <div class="form-control w-full">
        <label class="label"><span class="label-text">Session ID</span></label>
        <div class="relative">
          <input
            ref="inputRef"
            class="input input-bordered w-full pr-20"
            :class="{ 'input-error': sessionInputUiState.showInlineError }"
            :value="inputText"
            placeholder="输入 sessionId 搜索并选择"
            autocomplete="off"
            @focus="handleInputFocus"
            @click="handleInputFocus"
            @input="handleInput"
            @blur="handleInputBlur"
          />
          <div class="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
            <button
              v-if="hasValue"
              type="button"
              class="btn btn-ghost btn-xs btn-circle"
              @mousedown.prevent
              @click="clearSelection"
            >
              <XMarkIcon class="w-4 h-4" />
            </button>
            <span v-if="sessionInputUiState.showLoadingSpinner" class="loading loading-spinner loading-xs opacity-60"></span>
            <ChevronDownIcon v-else class="w-4 h-4 opacity-50 pointer-events-none" />
          </div>
        </div>
        <label class="label" v-if="sessionInputUiState.showInlineError">
          <span class="label-text-alt text-error">请选择列表中的有效 Session ID</span>
        </label>
      </div>

      <div v-if="dropdownOpen" class="rounded-lg border border-base-300 divide-y divide-base-300 overflow-hidden">
        <button
          v-for="candidate in mergedCandidates"
          :key="candidate.id"
          type="button"
          class="w-full px-3 py-2 text-left hover:bg-base-200"
          @mousedown.prevent
          @click="applySessionCandidate(candidate)"
        >
          <div class="font-medium truncate">{{ candidate.name || candidate.id }}</div>
          <div class="text-xs opacity-60 truncate">{{ candidate.id }}</div>
        </button>
        <div v-if="mergedCandidates.length === 0" class="px-3 py-2 text-sm opacity-60">暂无候选会话</div>
      </div>
    </div>
  </div>
</template>
