/**
 * JSON Pointer（RFC 6901 风格）读写工具。
 *
 * 独立成零依赖模块的原因：路径与 value 都来自 AI 输出（A2UI 消息），
 * 防原型污染的写入逻辑必须被所有写入方共用——
 * useA2UIState（用户输入路径）与 useA2UISurfaces（updateDataModel 活路径）都从这里引用，
 * 任何一方私改绕过防护都会重新打开污染面（详见代码审核 #2）。
 */

/** 原型污染危险键：路径来自 AI 输出（A2UI 消息），命中即拒写 */
const UNSAFE_POINTER_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

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
    // 不能用 Object.assign：value 若含 own key "__proto__"，[[Set]] 会触发原型链 setter 同样造成污染
    for (const [k, v] of Object.entries(value)) {
      if (UNSAFE_POINTER_KEYS.has(k)) continue
      obj[k] = v
    }
    return
  }
  const segments = path.replace(/^\//, '').split('/')
  let current = obj
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].replace(/~1/g, '/').replace(/~0/g, '~')
    if (UNSAFE_POINTER_KEYS.has(seg)) return // 拒绝沿原型链写入
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
  if (UNSAFE_POINTER_KEYS.has(lastSeg)) return
  const lastIndex = Number(lastSeg)
  if (Array.isArray(current) && !isNaN(lastIndex)) {
    current[lastIndex] = value
  } else {
    current[lastSeg] = value
  }
}
