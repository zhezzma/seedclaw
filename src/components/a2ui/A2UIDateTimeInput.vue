<script setup lang="ts">
/**
 * A2UI DateTimeInput 组件
 * 根据 enableDate 和 enableTime 选择不同的 input type
 */
import { computed, inject, ref, watch } from 'vue'
import type { A2UIComponent, DynamicString, DynamicBoolean } from './types'
import { getWritePath } from '../../composables/useA2UIState'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!
const resolveBoolean = inject<(v: DynamicBoolean) => boolean>('a2ui-resolve-boolean')!
const handleDataUpdate = inject<(path: string, value: any) => void>('a2ui-handle-data-update')!

const label = computed(() => resolveString(props.comp.label))
const enableDate = computed(() => props.comp.enableDate ?? false)
const enableTime = computed(() => props.comp.enableTime ?? false)
const resolvedValue = computed(() => resolveString(props.comp.value))
const resolvedMin = computed(() => resolveString(props.comp.min))
const resolvedMax = computed(() => resolveString(props.comp.max))

const localValue = ref(resolvedValue.value)

watch(resolvedValue, (v) => {
  if (v !== localValue.value) localValue.value = v
})

const inputType = computed(() => {
  if (enableDate.value && enableTime.value) return 'datetime-local'
  if (enableDate.value) return 'date'
  if (enableTime.value) return 'time'
  return 'datetime-local'
})

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  localValue.value = target.value
  const path = getWritePath(props.comp.value)
  if (path) {
    handleDataUpdate(path, target.value)
  }
}

const errorMessage = computed(() => {
  if (!props.comp.checks || props.comp.checks.length === 0) return ''
  for (const check of props.comp.checks) {
    if (!resolveBoolean(check.condition)) return check.message
  }
  return ''
})
</script>

<template>
  <div class="a2ui-datetime-input form-control w-full" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <label v-if="label" class="label">
      <span class="label-text text-sm">{{ label }}</span>
    </label>
    <input
      :type="inputType"
      :value="localValue"
      @input="onInput"
      :min="resolvedMin || undefined"
      :max="resolvedMax || undefined"
      class="input input-bordered input-sm w-full text-sm"
      :class="{ 'input-error': errorMessage }"
    />
    <label v-if="errorMessage" class="label pb-0">
      <span class="label-text-alt text-error font-medium">{{ errorMessage }}</span>
    </label>
  </div>
</template>
