/**
 * A2UI 状态管理 composable
 * 管理 Surface 生命周期、组件树和数据模型
 */

import { reactive } from 'vue'
import type {
  A2UIMessage,
  A2UIComponent,
  A2UISurface,
  DynamicString,
  DynamicNumber,
  DynamicBoolean,
  DynamicValue,
  DynamicStringList,
  DataBinding,
  FunctionCall,
  Action,
  ChildList,
} from '../components/a2ui/types'

// ==================== JSON Pointer 工具 ====================

/**
 * 通过 JSON Pointer 路径获取值
 * 例如: "/foo/bar/0" → obj.foo.bar[0]
 */
export function getByPath(obj: any, path: string): any {
  if (!path || path === '/') return obj
  const segments = path.replace(/^\//, '').split('/')
  let current = obj
  for (const seg of segments) {
    if (current == null) return undefined
    // 处理数组索引
    const index = Number(seg)
    if (Array.isArray(current) && !isNaN(index)) {
      current = current[index]
    } else {
      // JSON Pointer 需要反转义 ~1 → / 和 ~0 → ~
      const key = seg.replace(/~1/g, '/').replace(/~0/g, '~')
      current = current[key]
    }
  }
  return current
}

/**
 * 通过 JSON Pointer 路径设置值
 */
export function setByPath(obj: any, path: string, value: any): void {
  if (!path || path === '/') {
    Object.assign(obj, value)
    return
  }
  const segments = path.replace(/^\//, '').split('/')
  let current = obj
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].replace(/~1/g, '/').replace(/~0/g, '~')
    const index = Number(seg)
    if (Array.isArray(current) && !isNaN(index)) {
      if (current[index] == null) current[index] = {}
      current = current[index]
    } else {
      if (current[seg] == null) current[seg] = {}
      current = current[seg]
    }
  }
  const lastSeg = segments[segments.length - 1].replace(/~1/g, '/').replace(/~0/g, '~')
  const lastIndex = Number(lastSeg)
  if (Array.isArray(current) && !isNaN(lastIndex)) {
    current[lastIndex] = value
  } else {
    current[lastSeg] = value
  }
}

// ==================== 动态值解析 ====================

/** 判断是否为 DataBinding */
export function isDataBinding(v: any): v is DataBinding {
  return v != null && typeof v === 'object' && 'path' in v && typeof v.path === 'string' && !('call' in v)
}

/** 判断是否为 FunctionCall */
export function isFunctionCall(v: any): v is FunctionCall {
  return v != null && typeof v === 'object' && 'call' in v && typeof v.call === 'string'
}

/** 解析动态字符串 */
export function resolveDynamicString(value: DynamicString | undefined, dataModel: Record<string, any>): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (isDataBinding(value)) return String(getByPath(dataModel, value.path) ?? '')
  if (isFunctionCall(value)) return String(executeFunctionCall(value, dataModel) ?? '')
  return String(value)
}

/** 解析动态数字 */
export function resolveDynamicNumber(value: DynamicNumber | undefined, dataModel: Record<string, any>): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'number') return value
  if (isDataBinding(value)) return Number(getByPath(dataModel, value.path) ?? 0)
  if (isFunctionCall(value)) return Number(executeFunctionCall(value, dataModel)) || 0
  return Number(value) || 0
}

/** 解析动态布尔 */
export function resolveDynamicBoolean(value: DynamicBoolean | undefined, dataModel: Record<string, any>): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (isDataBinding(value)) return Boolean(getByPath(dataModel, value.path))
  if (isFunctionCall(value)) return Boolean(executeFunctionCall(value, dataModel))
  return false
}

/** 解析动态值 */
export function resolveDynamicValue(value: DynamicValue | undefined, dataModel: Record<string, any>): any {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value
  if (isDataBinding(value)) return getByPath(dataModel, value.path)
  if (isFunctionCall(value)) return executeFunctionCall(value, dataModel)
  return value
}

/** 解析动态字符串列表 */
export function resolveDynamicStringList(value: DynamicStringList | undefined, dataModel: Record<string, any>): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value
  if (isDataBinding(value)) {
    const resolved = getByPath(dataModel, value.path)
    return Array.isArray(resolved) ? resolved : []
  }
  if (isFunctionCall(value)) {
    const resolved = executeFunctionCall(value, dataModel)
    return Array.isArray(resolved) ? resolved : []
  }
  return []
}

/** 执行函数调用 */
export function executeFunctionCall(fn: FunctionCall, dataModel: Record<string, any>): any {
  const args = fn.args || {}
  const resolveArg = (val: any) => resolveDynamicValue(val, dataModel)

  switch (fn.call) {
    case 'required': {
      const val = resolveArg(args.value)
      if (val == null) return false
      if (typeof val === 'string' && val.trim() === '') return false
      if (Array.isArray(val) && val.length === 0) return false
      return true
    }
    case 'regex': {
      const val = String(resolveArg(args.value) ?? '')
      const pattern = String(args.pattern)
      try {
        return new RegExp(pattern).test(val)
      } catch (e) {
        return false
      }
    }
    case 'length': {
      const val = String(resolveArg(args.value) ?? '')
      const len = val.length
      if (args.min != null && len < Number(resolveArg(args.min))) return false
      if (args.max != null && len > Number(resolveArg(args.max))) return false
      return true
    }
    case 'numeric': {
      const val = Number(resolveArg(args.value))
      if (isNaN(val)) return false
      if (args.min != null && val < Number(resolveArg(args.min))) return false
      if (args.max != null && val > Number(resolveArg(args.max))) return false
      return true
    }
    case 'email': {
      const val = String(resolveArg(args.value) ?? '')
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
    }
    case 'and': {
      const values = args.values as any[]
      if (!Array.isArray(values)) return false
      return values.every(v => resolveDynamicBoolean(v, dataModel))
    }
    case 'or': {
      const values = args.values as any[]
      if (!Array.isArray(values)) return false
      return values.some(v => resolveDynamicBoolean(v, dataModel))
    }
    case 'not': {
      return !resolveDynamicBoolean(args.value, dataModel)
    }
    case 'formatString': {
      const template = String(resolveArg(args.value) || '')
      return template.replace(/\$\{([^}]+)\}/g, (match, expr) => {
        if (expr.startsWith('/')) return String(getByPath(dataModel, expr) ?? '')
        return match // Function interpolation requires full parser, skipping for now
      })
    }
    case 'formatNumber': {
      const val = Number(resolveArg(args.value))
      if (isNaN(val)) return ''
      const decimals = resolveArg(args.decimals)
      const grouping = resolveArg(args.grouping) !== false
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouping
      }).format(val)
    }
    case 'formatCurrency': {
      const val = Number(resolveArg(args.value))
      if (isNaN(val)) return ''
      const currency = String(resolveArg(args.currency) || 'USD')
      const decimals = resolveArg(args.decimals)
      const grouping = resolveArg(args.grouping) !== false
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: grouping
      }).format(val)
    }
    case 'formatDate': {
      const val = resolveArg(args.value)
      if (!val) return ''
      const date = new Date(val)
      if (isNaN(date.getTime())) return ''
      const formatStr = String(resolveArg(args.format) || 'yyyy-MM-dd')
      const yyyy = date.getFullYear().toString()
      const MM = (date.getMonth() + 1).toString().padStart(2, '0')
      const dd = date.getDate().toString().padStart(2, '0')
      const HH = date.getHours().toString().padStart(2, '0')
      const mm = date.getMinutes().toString().padStart(2, '0')
      const ss = date.getSeconds().toString().padStart(2, '0')
      return formatStr
        .replace(/yyyy/g, yyyy)
        .replace(/MM/g, MM)
        .replace(/dd/g, dd)
        .replace(/HH/g, HH)
        .replace(/mm/g, mm)
        .replace(/ss/g, ss)
    }
    case 'pluralize': {
      const val = Number(resolveArg(args.value))
      if (isNaN(val)) return ''
      const category = new Intl.PluralRules().select(val)
      return resolveArg(args[category]) || resolveArg(args.other) || ''
    }
    case 'openUrl': {
      const url = String(resolveArg(args.url) || '')
      if (url) window.open(url, '_blank')
      return undefined
    }
    default:
      console.warn('[A2UI] Unknown function call:', fn.call)
      return undefined
  }
}

/** 获取 DataBinding 的写入路径（如果值是 DataBinding） */
export function getWritePath(value: any): string | null {
  if (isDataBinding(value)) return value.path
  return null
}

// ==================== 子组件解析 ====================

/** 解析 ChildList 为组件 ID 数组 */
export function resolveChildList(
  children: ChildList | undefined,
  dataModel: Record<string, any>,
  allComponents: Map<string, A2UIComponent>
): string[] {
  if (!children) return []
  if (Array.isArray(children)) return children
  // 动态模板：根据 data path 生成子组件
  const { componentId, path } = children
  const items = getByPath(dataModel, path)
  if (!Array.isArray(items)) return []
  // 返回动态生成的组件 ID（基于模板 ID + 索引）
  return items.map((_: any, i: number) => `${componentId}__${i}`)
}

// ==================== Action 执行 ====================

export type ActionHandler = (action: Action, dataModel: Record<string, any>) => void

// ==================== Surface 管理 ====================

const surfaces = reactive(new Map<string, A2UISurface>())

export function useA2UIState() {
  /**
   * 处理 A2UI 消息
   */
  function processMessage(msg: A2UIMessage): void {
    if ('createSurface' in msg) {
      const { surfaceId, catalogId, theme, sendDataModel } = msg.createSurface
      surfaces.set(surfaceId, {
        surfaceId,
        catalogId,
        theme,
        components: new Map(),
        rootComponentIds: [],
        dataModel: reactive({}),
        sendDataModel,
      })
    } else if ('updateComponents' in msg) {
      const { surfaceId, components } = msg.updateComponents
      const surface = surfaces.get(surfaceId)
      if (!surface) {
        console.warn(`[A2UI] Surface not found: ${surfaceId}`)
        return
      }
      // 收集所有被引用为子组件的 ID
      const childIds = new Set<string>()
      for (const comp of components) {
        if (comp.id) {
          surface.components.set(comp.id, comp)
        }
        // 收集 children 引用
        if (comp.children) {
          if (Array.isArray(comp.children)) {
            comp.children.forEach((id: string) => childIds.add(id))
          }
        }
        // 收集 child / trigger / content 引用
        if (comp.child && typeof comp.child === 'string') childIds.add(comp.child)
        if (comp.trigger && typeof comp.trigger === 'string') childIds.add(comp.trigger)
        if (comp.content && typeof comp.content === 'string') childIds.add(comp.content)
        // 收集 tabs 中的 child 引用
        if (comp.tabs && Array.isArray(comp.tabs)) {
          comp.tabs.forEach((tab: any) => {
            if (tab.child) childIds.add(tab.child)
          })
        }
      }
      // 根组件 = 有 ID 但不被其他组件作为子组件引用的
      const rootIds = components
        .filter(c => c.id && !childIds.has(c.id))
        .map(c => c.id!)
      surface.rootComponentIds = rootIds
    } else if ('updateDataModel' in msg) {
      const { surfaceId, path, value } = msg.updateDataModel
      const surface = surfaces.get(surfaceId)
      if (!surface) return
      if (path) {
        setByPath(surface.dataModel, path, value)
      } else {
        Object.assign(surface.dataModel, value)
      }
    } else if ('deleteSurface' in msg) {
      surfaces.delete(msg.deleteSurface.surfaceId)
    }
  }

  /**
   * 获取 Surface
   */
  function getSurface(surfaceId: string): A2UISurface | undefined {
    return surfaces.get(surfaceId)
  }

  /**
   * 获取所有 Surfaces
   */
  function getAllSurfaces(): Map<string, A2UISurface> {
    return surfaces
  }

  /**
   * 清除所有 Surface
   */
  function clearAll(): void {
    surfaces.clear()
  }

  return {
    processMessage,
    getSurface,
    getAllSurfaces,
    clearAll,
    // 工具函数导出
    resolveDynamicString,
    resolveDynamicNumber,
    resolveDynamicBoolean,
    resolveDynamicValue,
    resolveDynamicStringList,
    resolveChildList,
    getWritePath,
    setByPath,
    getByPath,
  }
}
