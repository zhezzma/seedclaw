<script setup lang="ts">
/**
 * A2UI TextField 组件
 * 支持 shortText/longText/number/obscured 变体
 */
import { computed, inject, ref, watch } from 'vue'
import type { A2UIComponent, DynamicString } from './types'
import { getWritePath } from '../../composables/useA2UIState'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!
const handleDataUpdate = inject<(path: string, value: any) => void>('a2ui-handle-data-update')!

const label = computed(() => resolveString(props.comp.label))
const variant = computed(() => props.comp.variant || 'shortText')
const resolvedValue = computed(() => resolveString(props.comp.value))

const localValue = ref(resolvedValue.value)

// 同步外部值到本地
watch(resolvedValue, (v) => {
  if (v !== localValue.value) localValue.value = v
})

function onInput(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement
  localValue.value = target.value
  const path = getWritePath(props.comp.value)
  if (path) {
    handleDataUpdate(path, target.value)
  }
}

const inputType = computed(() => {
  const map: Record<string, string> = {
    shortText: 'text',
    number: 'number',
    obscured: 'password',
  }
  return map[variant.value] || 'text'
})

const validationPattern = computed(() => props.comp.validationRegexp || undefined)
</script>

<template>
  <div class="a2ui-text-field form-control w-full" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <label v-if="label" class="label">
      <span class="label-text text-sm">{{ label }}</span>
    </label>
    <textarea
      v-if="variant === 'longText'"
      :value="localValue"
      @input="onInput"
      class="textarea textarea-bordered w-full text-sm min-h-[80px] resize-y"
      :placeholder="label"
      rows="3"
    ></textarea>
    <input
      v-else
      :type="inputType"
      :value="localValue"
      @input="onInput"
      class="input input-bordered w-full input-sm text-sm"
      :placeholder="label"
      :pattern="validationPattern"
    />
  </div>
</template>
