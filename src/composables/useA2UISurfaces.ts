/**
 * A2UI Surface 注册表（全局单例）
 *
 * A2UI 协议中，Surface 是有状态的生命周期对象（通过 surfaceId 标识）：
 * - createSurface → 创建
 * - updateComponents → 更新组件树
 * - updateDataModel → 更新数据模型
 * - deleteSurface → 销毁
 *
 * 在聊天场景中，一个 Surface 的创建（消息A）和后续更新（消息B）可能跨越多条消息。
 * 本注册表为每个 surfaceId 维护一个 reactive 的数据模型引用，
 * 使得后续消息中的 updateDataModel 能够更新到已渲染的 Surface 上。
 */

import { reactive } from 'vue'
import { setByPath } from '../utils/json-pointer.ts'

export interface SurfaceEntry {
  /** Surface ID */
  surfaceId: string
  /** 响应式数据模型（所有引用此 surface 的组件共享同一个 reactive 对象） */
  dataModel: Record<string, any>
  /** 已处理过的消息内容哈希集合（防止 computed 重算时重复初始化） */
  processedHashes: Set<string>
}

/** 全局 Surface 注册表 */
const surfaces = new Map<string, SurfaceEntry>()

/**
 * 获取或创建 Surface 的数据模型
 * - 如果 surfaceId 已存在，返回已有的 reactive 数据模型（保留用户输入状态）
 * - 如果不存在，创建新的并注册
 */
export function getOrCreateSurface(surfaceId: string): SurfaceEntry {
  let entry = surfaces.get(surfaceId)
  if (!entry) {
    entry = {
      surfaceId,
      dataModel: reactive<Record<string, any>>({}),
      processedHashes: new Set(),
    }
    surfaces.set(surfaceId, entry)
  }
  return entry
}

/**
 * 生成内容哈希（用于去重）
 * 简单拼接 surfaceId + path + value 的 JSON 作为唯一标识
 */
function makeHash(surfaceId: string, path: string | undefined, value: any): string {
  return `${surfaceId}:${path || '/'}:${JSON.stringify(value)}`
}

/**
 * 更新 Surface 的数据模型（幂等）
 * 相同内容不会重复应用，防止 computed 重算时覆盖用户输入
 * @returns 是否实际执行了更新
 */
export function updateSurfaceDataModel(
  surfaceId: string,
  path: string | undefined,
  value: any
): boolean {
  const entry = getOrCreateSurface(surfaceId)

  // 去重：相同内容只处理一次
  const hash = makeHash(surfaceId, path, value)
  if (entry.processedHashes.has(hash)) return false
  entry.processedHashes.add(hash)

  // 写入必须走防护版 setByPath：这里的 path/value 都是 AI 输出，
  // 裸遍历（in 检查沿原型链）与 Object.assign 都可被 /__proto__、/constructor/prototype 污染
  // （代码审核 #2，与 useA2UIState 共用同一实现，勿在本文件复制逻辑）
  if (!path || path === '/') {
    // 根路径：合并到 reactive 对象
    if (typeof value === 'object' && value !== null) {
      setByPath(entry.dataModel, '/', value)
    }
  } else {
    // 子路径：按 JSON Pointer 设置（防原型污染）
    setByPath(entry.dataModel, path, value)
  }

  return true
}

/**
 * 删除 Surface
 */
export function deleteSurface(surfaceId: string): void {
  surfaces.delete(surfaceId)
}

/**
 * 获取已有 Surface（不创建）
 */
export function getSurface(surfaceId: string): SurfaceEntry | undefined {
  return surfaces.get(surfaceId)
}

/**
 * 清空所有 Surface（用于会话切换等场景）
 */
export function clearAllSurfaces(): void {
  surfaces.clear()
}
