/**
 * A2UI 组件统一导出
 */

// 类型导出
export type {
  A2UIComponent,
  A2UIComponentType,
  A2UIMessage,
  A2UISurface,
  CreateSurfaceMessage,
  UpdateComponentsMessage,
  UpdateDataModelMessage,
  DeleteSurfaceMessage,
  Action,
  DynamicString,
  DynamicNumber,
  DynamicBoolean,
  DynamicValue,
  DynamicStringList,
  DataBinding,
  FunctionCall,
  ChildList,
  CheckRule,
  AccessibilityAttributes,
  IconName,
} from './types'

export { ICON_NAMES } from './types'

// 组件导出
export { default as A2UIRenderer } from './A2UIRenderer.vue'
export { default as A2UIText } from './A2UIText.vue'
export { default as A2UIImage } from './A2UIImage.vue'
export { default as A2UIIcon } from './A2UIIcon.vue'
export { default as A2UIVideo } from './A2UIVideo.vue'
export { default as A2UIAudioPlayer } from './A2UIAudioPlayer.vue'
export { default as A2UIDivider } from './A2UIDivider.vue'
export { default as A2UIRow } from './A2UIRow.vue'
export { default as A2UIColumn } from './A2UIColumn.vue'
export { default as A2UIList } from './A2UIList.vue'
export { default as A2UICard } from './A2UICard.vue'
export { default as A2UIButton } from './A2UIButton.vue'
export { default as A2UITextField } from './A2UITextField.vue'
export { default as A2UICheckBox } from './A2UICheckBox.vue'
export { default as A2UIChoicePicker } from './A2UIChoicePicker.vue'
export { default as A2UISlider } from './A2UISlider.vue'
export { default as A2UIDateTimeInput } from './A2UIDateTimeInput.vue'
export { default as A2UITabs } from './A2UITabs.vue'
export { default as A2UIModal } from './A2UIModal.vue'
