<script setup lang="ts">
/**
 * A2UI ChoicePicker 组件
 * 支持 mutuallyExclusive/multipleSelection，displayStyle: checkbox/chips
 */
import { computed, inject, ref, watch } from 'vue'
import type { A2UIComponent, DynamicString, DynamicStringList, DynamicBoolean } from './types'
import { getWritePath } from '../../composables/useA2UIState'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!
const resolveStringList = inject<(v: DynamicStringList) => string[]>('a2ui-resolve-string-list')!
const resolveBoolean = inject<(v: DynamicBoolean) => boolean>('a2ui-resolve-boolean')!
const handleDataUpdate = inject<(path: string, value: any) => void>('a2ui-handle-data-update')!

const label = computed(() => resolveString(props.comp.label))
const variant = computed(() => props.comp.variant || 'mutuallyExclusive')
const displayStyle = computed(() => props.comp.displayStyle || 'checkbox')
const filterable = computed(() => props.comp.filterable || false)
const options = computed(() => {
  return (props.comp.options || []).map((opt: any) => ({
    label: resolveString(opt.label),
    value: opt.value,
  }))
})

const resolvedValue = computed(() => resolveStringList(props.comp.value))
const localSelected = ref<string[]>([...resolvedValue.value])

watch(resolvedValue, (v) => {
  localSelected.value = [...v]
}, { deep: true })

const filterText = ref('')

const filteredOptions = computed(() => {
  if (!filterable.value || !filterText.value) return options.value
  const q = filterText.value.toLowerCase()
  return options.value.filter((o: { label: string }) => o.label.toLowerCase().includes(q))
})

function toggleOption(value: string) {
  if (variant.value === 'mutuallyExclusive') {
    localSelected.value = [value]
  } else {
    const idx = localSelected.value.indexOf(value)
    if (idx >= 0) {
      localSelected.value.splice(idx, 1)
    } else {
      localSelected.value.push(value)
    }
  }
  syncValue()
}

function isSelected(value: string) {
  return localSelected.value.includes(value)
}

function syncValue() {
  const path = getWritePath(props.comp.value)
  if (path) {
    handleDataUpdate(path, [...localSelected.value])
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
  <div class="a2ui-choice-picker form-control w-full" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <label v-if="label" class="label">
      <span class="label-text text-sm font-medium">{{ label }}</span>
    </label>

    <!-- 搜索过滤 -->
    <input
      v-if="filterable"
      v-model="filterText"
      type="text"
      class="input input-bordered input-sm w-full mb-2 text-sm"
      placeholder="搜索..."
    />

    <!-- Chips 显示样式 -->
    <div v-if="displayStyle === 'chips'" class="flex flex-wrap gap-1.5">
      <button
        v-for="opt in filteredOptions"
        :key="opt.value"
        @click="toggleOption(opt.value)"
        class="btn btn-xs transition-all duration-150"
        :class="isSelected(opt.value) ? 'btn-primary' : 'btn-outline'"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- Checkbox / Radio 显示样式 -->
    <div v-else class="flex flex-col gap-1.5">
      <label
        v-for="opt in filteredOptions"
        :key="opt.value"
        class="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded-lg px-2 py-1 transition-colors"
      >
        <input
          v-if="variant === 'mutuallyExclusive'"
          type="radio"
          :name="comp.id || 'choice'"
          :value="opt.value"
          :checked="isSelected(opt.value)"
          @change="toggleOption(opt.value)"
          class="radio radio-sm radio-primary"
        />
        <input
          v-else
          type="checkbox"
          :checked="isSelected(opt.value)"
          @change="toggleOption(opt.value)"
          class="checkbox checkbox-sm checkbox-primary"
        />
        <span class="label-text text-sm">{{ opt.label }}</span>
      </label>
    </div>

    <!-- 错误信息 -->
    <label v-if="errorMessage" class="label pb-0">
      <span class="label-text-alt text-error font-medium">{{ errorMessage }}</span>
    </label>
  </div>
</template>
