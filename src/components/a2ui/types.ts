/**
 * A2UI v0.9 协议类型定义
 * 基于 https://github.com/google/A2UI 规范
 */

// ==================== 动态值类型 ====================

/** 数据绑定 - JSON Pointer 路径 */
export interface DataBinding {
  path: string
}

/** 函数调用 */
export interface FunctionCall {
  call: string
  args: Record<string, any>
  returnType?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any' | 'void'
}

/** 动态字符串：字面值 | 数据绑定 | 函数调用 */
export type DynamicString = string | DataBinding | FunctionCall

/** 动态数字 */
export type DynamicNumber = number | DataBinding | FunctionCall

/** 动态布尔 */
export type DynamicBoolean = boolean | DataBinding | LogicExpression

/** 动态字符串列表 */
export type DynamicStringList = string[] | DataBinding | FunctionCall

/** 动态值 */
export type DynamicValue = string | number | boolean | any[] | DataBinding | FunctionCall

// ==================== 逻辑表达式 ====================

export type LogicExpression =
  | { and: LogicExpression[] }
  | { or: LogicExpression[] }
  | { not: LogicExpression }
  | FunctionCall
  | { true: true }
  | { false: false }

// ==================== 子组件与动作 ====================

/** 子组件列表：静态 ID 数组 或 动态模板 */
export type ChildList = string[] | { componentId: string; path: string }

/** 动作 */
export type Action =
  | { event: { name: string; context?: Record<string, DynamicValue> } }
  | { functionCall: FunctionCall }

/** 验证规则 */
export interface CheckRule {
  condition: DynamicBoolean
  message: string
}

/** 无障碍属性 */
export interface AccessibilityAttributes {
  label?: DynamicString
  description?: DynamicString
}

// ==================== 组件类型定义 ====================

interface ComponentBase {
  component: string
  id?: string
  weight?: number
  accessibility?: AccessibilityAttributes
}

export interface TextComponent extends ComponentBase {
  component: 'Text'
  text: DynamicString
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'caption' | 'body'
}

export interface ImageComponent extends ComponentBase {
  component: 'Image'
  url: DynamicString
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scaleDown'
  variant?: 'icon' | 'avatar' | 'smallFeature' | 'mediumFeature' | 'largeFeature' | 'header'
}

export const ICON_NAMES = [
  'accountCircle', 'add', 'arrowBack', 'arrowForward', 'attachFile',
  'calendarToday', 'call', 'camera', 'check', 'close', 'delete',
  'download', 'edit', 'event', 'error', 'fastForward', 'favorite',
  'favoriteOff', 'folder', 'help', 'home', 'info', 'locationOn',
  'lock', 'lockOpen', 'mail', 'menu', 'moreVert', 'moreHoriz',
  'notificationsOff', 'notifications', 'pause', 'payment', 'person',
  'phone', 'photo', 'play', 'print', 'refresh', 'rewind', 'search',
  'send', 'settings', 'share', 'shoppingCart', 'skipNext',
  'skipPrevious', 'star', 'starHalf', 'starOff', 'stop', 'upload',
  'visibility', 'visibilityOff', 'volumeDown', 'volumeMute',
  'volumeOff', 'volumeUp', 'warning'
] as const

export type IconName = (typeof ICON_NAMES)[number]

export interface IconComponent extends ComponentBase {
  component: 'Icon'
  name: IconName | { path: string }
}

export interface VideoComponent extends ComponentBase {
  component: 'Video'
  url: DynamicString
}

export interface AudioPlayerComponent extends ComponentBase {
  component: 'AudioPlayer'
  url: DynamicString
  description?: DynamicString
}

export interface RowComponent extends ComponentBase {
  component: 'Row'
  children: ChildList
  justify?: 'center' | 'end' | 'spaceAround' | 'spaceBetween' | 'spaceEvenly' | 'start' | 'stretch'
  align?: 'start' | 'center' | 'end' | 'stretch'
}

export interface ColumnComponent extends ComponentBase {
  component: 'Column'
  children: ChildList
  justify?: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly' | 'stretch'
  align?: 'center' | 'end' | 'start' | 'stretch'
}

export interface ListComponent extends ComponentBase {
  component: 'List'
  children: ChildList
  direction?: 'vertical' | 'horizontal'
  align?: 'start' | 'center' | 'end' | 'stretch'
}

export interface CardComponent extends ComponentBase {
  component: 'Card'
  child: string
}

export interface TabsComponent extends ComponentBase {
  component: 'Tabs'
  tabs: Array<{ title: DynamicString; child: string }>
}

export interface ModalComponent extends ComponentBase {
  component: 'Modal'
  trigger: string
  content: string
}

export interface DividerComponent extends ComponentBase {
  component: 'Divider'
  axis?: 'horizontal' | 'vertical'
}

export interface ButtonComponent extends ComponentBase {
  component: 'Button'
  child: string
  variant?: 'default' | 'primary' | 'borderless'
  action: Action
  checks?: CheckRule[]
}

export interface TextFieldComponent extends ComponentBase {
  component: 'TextField'
  label: DynamicString
  value?: DynamicString
  variant?: 'longText' | 'number' | 'shortText' | 'obscured'
  validationRegexp?: string
  checks?: CheckRule[]
}

export interface CheckBoxComponent extends ComponentBase {
  component: 'CheckBox'
  label: DynamicString
  value: DynamicBoolean
  checks?: CheckRule[]
}

export interface ChoicePickerComponent extends ComponentBase {
  component: 'ChoicePicker'
  label?: DynamicString
  variant?: 'multipleSelection' | 'mutuallyExclusive'
  options: Array<{ label: DynamicString; value: string }>
  value: DynamicStringList
  displayStyle?: 'checkbox' | 'chips'
  filterable?: boolean
  checks?: CheckRule[]
}

export interface SliderComponent extends ComponentBase {
  component: 'Slider'
  label?: DynamicString
  min?: number
  max: number
  value: DynamicNumber
  checks?: CheckRule[]
}

export interface DateTimeInputComponent extends ComponentBase {
  component: 'DateTimeInput'
  value: DynamicString
  enableDate?: boolean
  enableTime?: boolean
  min?: DynamicString
  max?: DynamicString
  label?: DynamicString
  checks?: CheckRule[]
}

/** 所有 A2UI 组件联合类型 */
export type A2UIComponentType =
  | TextComponent
  | ImageComponent
  | IconComponent
  | VideoComponent
  | AudioPlayerComponent
  | RowComponent
  | ColumnComponent
  | ListComponent
  | CardComponent
  | TabsComponent
  | ModalComponent
  | DividerComponent
  | ButtonComponent
  | TextFieldComponent
  | CheckBoxComponent
  | ChoicePickerComponent
  | SliderComponent
  | DateTimeInputComponent

/** 通用 A2UI 组件（松散类型，用于解析时） */
export interface A2UIComponent {
  component: string
  id?: string
  weight?: number
  [key: string]: any
}

// ==================== 消息类型 ====================

export interface CreateSurfaceMessage {
  version: 'v0.9'
  createSurface: {
    surfaceId: string
    catalogId: string
    theme?: any
    sendDataModel?: boolean
  }
}

export interface UpdateComponentsMessage {
  version: 'v0.9'
  updateComponents: {
    surfaceId: string
    components: A2UIComponent[]
  }
}

export interface UpdateDataModelMessage {
  version: 'v0.9'
  updateDataModel: {
    surfaceId: string
    path?: string
    value?: any
  }
}

export interface DeleteSurfaceMessage {
  version: 'v0.9'
  deleteSurface: {
    surfaceId: string
  }
}

export type A2UIMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage

// ==================== Surface 状态 ====================

export interface A2UISurface {
  surfaceId: string
  catalogId: string
  theme?: any
  components: Map<string, A2UIComponent>
  /** 根组件 ID 列表（按顺序） */
  rootComponentIds: string[]
  dataModel: Record<string, any>
  sendDataModel?: boolean
}
