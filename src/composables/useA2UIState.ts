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
import { A2UI_VERSION, SEEDCODE_BASIC_CATALOG_ID } from '../components/a2ui/types.ts'

// ==================== JSON Pointer 工具 ====================

// 实现已抽到零依赖 util：路径/value 来自 AI 输出，防污染写入逻辑
// 必须被所有写入方（含 useA2UISurfaces 的 updateDataModel 活路径）共用，
// 不得在本文件内另起炉灶（详见代码审核 #2）。
import { getByPath, setByPath } from '../utils/json-pointer.ts'
export { getByPath, setByPath }

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

/** 解析动态布尔；v1.0：求值结果可为 ValidationResult（{valid} 解包，布尔返回值兼容） */
export function resolveDynamicBoolean(value: DynamicBoolean | undefined, dataModel: Record<string, any>): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (isDataBinding(value)) return unwrapValidationResult(getByPath(dataModel, value.path))
  if (isFunctionCall(value)) return unwrapValidationResult(executeFunctionCall(value, dataModel))
  return false
}

/** v1.0 ValidationResult 解包：{valid: boolean} 取 valid，其余原样布尔化 */
function unwrapValidationResult(resolved: any): boolean {
  if (resolved != null && typeof resolved === 'object' && typeof resolved.valid === 'boolean') {
    return resolved.valid
  }
  return Boolean(resolved)
}

/** 解析动态值字典（action context / functionCall args）：每个条目经 resolveDynamicValue
 *  绑定解析后上送——服务端不解析渲染端数据模型，未解析的 {path} 绑定会导致 rpc 参数失配。 */
export function resolveDynamicRecord(
  record: Record<string, DynamicValue> | undefined,
  dataModel: Record<string, any>
): Record<string, unknown> {
  if (!record) return {}
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    resolved[key] = resolveDynamicValue(value, dataModel)
  }
  return resolved
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

// ==================== 表单 RPC 调度 ====================

/**
 * a2ui 设置表单的 rpc 调度器：快操作（ChoicePicker 级联）串行、慢操作（安装类）旁路。
 *
 * 为什么需要分道：串行链本意是防级联响应先发后至乱序覆盖 dataModel；但安装类
 * rpc 是分钟级请求，入链会把 await 链的 save()（防半更新 dataModel 落盘）与后续
 * 级联全部卡到安装结束（实测：安装中点保存永久卡死，三个扩展全中）。
 *
 * 快慢的判定约定 = 服务端 pendingPath/pendingText 标记（“慢操作反馈”机制，
 * 快级联不声明）。慢操作只写状态行路径，与级联变更的字段不相交，并行安全；
 * 完成回包的 updateDataModel 照常就地刷新，保存落盘的是配置键，两不相干。
 */
export function createA2uiRpcScheduler() {
  let chain: Promise<void> = Promise.resolve()
  return {
    /** 快操作串行链落地Promise（save 落盘前 await 它，防半更新 dataModel 被保存） */
    get settled(): Promise<void> {
      return chain
    },
    /**
     * 调度一个 rpc 执行体。
     * @param slow true = 安装类慢操作，旁路串行链独立执行；false = 快级联，入链串行
     */
    schedule(run: () => Promise<void>, slow: boolean): Promise<void> {
      if (slow) {
        // 旁路：失败静默（api-client 已弹全局 toast），不占用链、不让链等待
        return run().catch(() => {})
      }
      const link = chain.then(run, run) // 前序失败已就地消化，此处恒运行
      chain = link.catch(() => {}) // 链不携带 rejection，防后续级联被毒化
      return link
    },
  }
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
    case 'equals': {
      // 值相等比较（宽松 ==："18799" == 18799）；与 resolveVisibility 简写共用 looseEquals，
      // 保证两种写法语义一致（ChoicePicker 单选数组同样取首元素）
      return looseEquals(resolveArg(args.value), resolveArg(args.other))
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
      if (!url) return undefined
      // A2UI 内容来自模型/服务端：仅放行 http(s)，防 javascript: 等 scheme 在应用内执行
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        console.warn('[A2UI] openUrl ignored invalid url:', url)
        return undefined
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        console.warn('[A2UI] openUrl blocked non-http(s) url:', url)
        return undefined
      }
      // 用 <a target="_blank"> 同路径（WebView 新窗口机制），window.open 在 Tauri WebView 内不可靠
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
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

/** 宽松相等（两侧数组取首元素）：resolveVisibility 简写与 equals FunctionCall 共用，保证语义一致。
 *  多选数组仅首元素参与匹配，其余元素不可达；DSL 无 contains 算子，「包含」语义当前无法表达。 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) a = a[0]
  if (Array.isArray(b)) b = b[0]
  // 布尔规范化：CheckBox 等组件写入布尔 true，而 DSL 里 equals:"true" 是字符串——
  // 直接 == 会永久失配（true == "true" 为 false），字段静默隐藏；布尔与字符串比较时统一转字符串
  if (typeof a === 'boolean' && typeof b === 'string') return String(a) === b
  if (typeof b === 'boolean' && typeof a === 'string') return a === String(b)
  // eslint-disable-next-line eqeqeq
  return a == b
}

/**
 * 解析组件的 visible 条件（DynamicBoolean 或 {path, equals} 值比较）；缺省可见。
 * 注意覆盖面：仅经 resolveChildList 过滤的 children（Row/Column/List）会应用 visible；
 * 根组件、Card.child、Tabs.tab.child、Modal trigger/content 等单子组件路径不经过该过滤，
 * 在这些位置声明 visible 不会生效。
 */
function resolveVisibility(comp: A2UIComponent | undefined, dataModel: Record<string, any>): boolean {
  if (!comp || comp.visible === undefined || comp.visible === null) return true
  const v = comp.visible
  if (typeof v === 'boolean') return v
  // {path, equals}：值比较简写（looseEquals：ChoicePicker 等单选数组取首元素）
  if (v != null && typeof v === 'object' && 'equals' in v) {
    return looseEquals(getByPath(dataModel, v.path), v.equals)
  }
  return resolveDynamicBoolean(v, dataModel)
}

/** 解析 ChildList 为组件 ID 数组（应用 visible 条件过滤） */
export function resolveChildList(
  children: ChildList | undefined,
  dataModel: Record<string, any>,
  allComponents: Map<string, A2UIComponent>
): string[] {
  if (!children) return []
  const base: string[] = Array.isArray(children) ? children : (() => {
    // 动态模板：根据 data path 生成子组件
    const { componentId, path } = children
    const items = getByPath(dataModel, path)
    if (!Array.isArray(items)) return []
    // 返回动态生成的组件 ID（基于模板 ID + 索引）
    return items.map((_: any, i: number) => `${componentId}__${i}`)
  })()
  // visible 条件过滤：不满足的子组件不渲染（Row/Column/List 的 children 统一经此处过滤）
  return base.filter((id) => resolveVisibility(allComponents.get(id), dataModel))
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
      const { surfaceId, catalogId, sendDataModel, components, dataModel } = msg.createSurface
      const surface: A2UISurface = {
        surfaceId,
        catalogId: catalogId ?? SEEDCODE_BASIC_CATALOG_ID,
        components: new Map(),
        rootComponentIds: [],
        dataModel: reactive({}),
        sendDataModel,
      }
      surfaces.set(surfaceId, surface)
      // v1.0：createSurface 可内联 components / 初始 dataModel（单消息整面 UI）
      if (Array.isArray(components)) {
        processMessage({ version: A2UI_VERSION, updateComponents: { surfaceId, components } } as A2UIMessage)
      }
      if (dataModel && typeof dataModel === 'object') {
        processMessage({ version: A2UI_VERSION, updateDataModel: { surfaceId, path: '/', value: dataModel } } as A2UIMessage)
      }
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
      } else if (typeof value === 'object' && value !== null) {
        // 走防护版而非 Object.assign：value 含 own key "__proto__" 时
        // [[Set]] 会触发原型链 setter 造成污染（代码审核 #2）
        setByPath(surface.dataModel, '', value)
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
