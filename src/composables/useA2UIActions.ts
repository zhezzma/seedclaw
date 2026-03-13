/**
 * A2UI Action 转发器
 * 将 A2UI event 类型的 action 转发给服务端 Agent 处理
 * 客户端不包含任何业务逻辑
 */

import type { Action } from '../components/a2ui/types'
import { useChatState } from './useChatState'

/**
 * 处理 A2UI Action 事件
 * - event 类型：转发给服务端 Agent 处理
 * - functionCall 类型：客户端本地执行（暂未实现）
 */
export function handleA2UIAction(
  action: Action,
  dataModel: Record<string, any>,
  surfaceId: string,
  sourceComponentId: string
) {
  if ('event' in action) {
    // A2UI 协议：event 类型 action → 发给服务端
    const { name, context } = action.event
    const chatState = useChatState()

    const payload = {
      version: 'v0.9',
      action: {
        name,
        surfaceId,
        sourceComponentId,
        timestamp: new Date().toISOString(),
        context: context || {},
      },
      a2uiClientDataModel: {
        version: 'v0.9',
        surfaces: {
          [surfaceId]: dataModel
        }
      }
    }

    // 通过 sendMessage 发给 Agent
    // Agent 可以读取事件信息并通过 <a2ui> 回传 updateDataModel
    chatState.sendMessage(
      `/a2ui-event ${JSON.stringify(payload)}`
    )
  } else if ('functionCall' in action) {
    // A2UI 协议：functionCall 类型 → 客户端本地执行
    console.log('[A2UI] functionCall not implemented:', action.functionCall)
  }
}
