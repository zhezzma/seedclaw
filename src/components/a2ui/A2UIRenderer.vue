<script setup lang="ts">
/**
 * A2UI 入口渲染器（通用基础设施）
 * 接收组件列表和数据模型，递归渲染组件树
 * 不包含任何业务逻辑，Action 事件向上冒泡由使用方处理
 */
import { computed, provide, toRef, type Component as VueComponent } from 'vue'
import type { A2UIComponent, Action } from './types'
import {
  resolveDynamicString,
  resolveDynamicNumber,
  resolveDynamicBoolean,
  resolveDynamicValue,
  resolveDynamicStringList,
  resolveChildList,
  getWritePath,
  setByPath,
} from '../../composables/useA2UIState'

import A2UIText from './A2UIText.vue'
import A2UIImage from './A2UIImage.vue'
import A2UIIcon from './A2UIIcon.vue'
import A2UIVideo from './A2UIVideo.vue'
import A2UIAudioPlayer from './A2UIAudioPlayer.vue'
import A2UIDivider from './A2UIDivider.vue'
import A2UIRow from './A2UIRow.vue'
import A2UIColumn from './A2UIColumn.vue'
import A2UIList from './A2UIList.vue'
import A2UICard from './A2UICard.vue'
import A2UIButton from './A2UIButton.vue'
import A2UITextField from './A2UITextField.vue'
import A2UICheckBox from './A2UICheckBox.vue'
import A2UIChoicePicker from './A2UIChoicePicker.vue'
import A2UISlider from './A2UISlider.vue'
import A2UIDateTimeInput from './A2UIDateTimeInput.vue'
import A2UITabs from './A2UITabs.vue'
import A2UIModal from './A2UIModal.vue'

const props = defineProps<{
  /** 所有组件列表 */
  components: A2UIComponent[]
  /** 数据模型（来自 Surface 注册表的 reactive 对象） */
  dataModel?: Record<string, any>
  /** 要渲染的组件 ID 列表（可选） */
  rootIds?: string[]
  /** 禁用所有交互（action 触发后锁住 surface） */
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'action', action: Action, dataModel: Record<string, any>, sourceComponentId: string): void
  (e: 'update-data', path: string, value: any): void
}>()

/** 组件注册表 */
const componentRegistry: Record<string, VueComponent> = {
  Text: A2UIText,
  Image: A2UIImage,
  Icon: A2UIIcon,
  Video: A2UIVideo,
  AudioPlayer: A2UIAudioPlayer,
  Divider: A2UIDivider,
  Row: A2UIRow,
  Column: A2UIColumn,
  List: A2UIList,
  Card: A2UICard,
  Button: A2UIButton,
  TextField: A2UITextField,
  CheckBox: A2UICheckBox,
  ChoicePicker: A2UIChoicePicker,
  Slider: A2UISlider,
  DateTimeInput: A2UIDateTimeInput,
  Tabs: A2UITabs,
  Modal: A2UIModal,
}

const componentMap = computed(() => {
  const map = new Map<string, A2UIComponent>()
  for (const comp of props.components) {
    if (comp.id) map.set(comp.id, comp)
  }
  return map
})

const resolvedRootIds = computed(() => {
  if (props.rootIds?.length) return props.rootIds
  const childIds = new Set<string>()
  for (const comp of props.components) {
    if (comp.children && Array.isArray(comp.children)) {
      comp.children.forEach((id: string) => childIds.add(id))
    }
    if (comp.child && typeof comp.child === 'string') childIds.add(comp.child)
    if (comp.trigger && typeof comp.trigger === 'string') childIds.add(comp.trigger)
    if (comp.content && typeof comp.content === 'string') childIds.add(comp.content)
    if (comp.tabs && Array.isArray(comp.tabs)) {
      comp.tabs.forEach((tab: any) => { if (tab.child) childIds.add(tab.child) })
    }
  }
  return props.components.filter(c => c.id && !childIds.has(c.id)).map(c => c.id!)
})

/**
 * 数据模型
 * 直接引用 props.dataModel（来自 Surface 注册表的 reactive 对象）
 * Vue 原生追踪 reactive 对象的深层变化，无需额外版本号
 */
const dataModelRef = computed(() => props.dataModel || {})

function getVueComponent(name: string): VueComponent | null {
  return componentRegistry[name] || null
}

function getComponentById(id: string): A2UIComponent | undefined {
  return componentMap.value.get(id)
}

/** 更新数据模型 */
function updateData(path: string, value: any) {
  setByPath(dataModelRef.value, path, value)
  emit('update-data', path, value)
}

/** Action 冒泡，补充来源组件 ID */
function handleAction(action: Action, sourceComponentId: string = '') {
  emit('action', action, dataModelRef.value, sourceComponentId)
}

// provide/inject 上下文
provide('a2ui-components', componentMap)
provide('a2ui-data-model', dataModelRef)
provide('a2ui-get-component', getComponentById)
provide('a2ui-get-vue-component', getVueComponent)
provide('a2ui-handle-action', handleAction)
provide('a2ui-handle-data-update', updateData)
provide('a2ui-disabled', toRef(props, 'disabled'))
provide('a2ui-resolve-string', (v: any) => resolveDynamicString(v, dataModelRef.value))
provide('a2ui-resolve-number', (v: any) => resolveDynamicNumber(v, dataModelRef.value))
provide('a2ui-resolve-boolean', (v: any) => resolveDynamicBoolean(v, dataModelRef.value))
provide('a2ui-resolve-value', (v: any) => resolveDynamicValue(v, dataModelRef.value))
provide('a2ui-resolve-string-list', (v: any) => resolveDynamicStringList(v, dataModelRef.value))
provide('a2ui-resolve-children', (v: any) => resolveChildList(v, dataModelRef.value, componentMap.value))
provide('a2ui-get-write-path', getWritePath)
</script>

<template>
  <div class="a2ui-surface flex flex-col gap-2 relative">
    <template v-for="rootId in resolvedRootIds" :key="rootId">
      <component
        v-if="getComponentById(rootId) && getVueComponent(getComponentById(rootId)!.component)"
        :is="getVueComponent(getComponentById(rootId)!.component)!"
        :comp="getComponentById(rootId)!"
      />
      <div v-else-if="getComponentById(rootId)" class="text-warning text-xs p-1">
        ⚠ 未知组件类型: {{ getComponentById(rootId)?.component }}
      </div>
    </template>
    <!-- Action 触发后的交互锁定遮罩 -->
    <div
      v-if="disabled"
      class="absolute inset-0 z-10 cursor-not-allowed rounded"
      style="pointer-events: all;"
    />
  </div>
</template>
