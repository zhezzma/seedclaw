/**
 * A2UI Action 上行转发器（v1.0 HTTP RPC）
 * event/functionCall 两类 action 都走 POST /api/a2ui/events；
 * 响应的 agent_to_renderer messages 统一应用到 Surface 注册表（就地更新面板）。
 * 客户端不含业务逻辑。
 */

import type { Action } from '../components/a2ui/types'
import { resolveDynamicRecord } from './useA2UIState'
import { sendA2uiAction, callA2uiAgentFunction, type A2uiResponseMessage } from './a2uiClient'
import { updateSurfaceDataModel, deleteSurface } from './useA2UISurfaces'
import { useToast } from './useToast'
import { i18n } from '../i18n'

/** 响应 messages 应用到聊天面板 surface：updateDataModel 以服务端权威语义强写
 *  （force 压过重放去重、仅限已存在的 surface，防会话切换后晚到响应建幽灵面）；
 *  deleteSurface 销毁；agentFunctionResponse 是 rpc 回执静默通过；
 *  updateComponents 不适用（聊天面板组件树在消息块里），丢弃并告警。 */
function applyResponseMessages(messages: A2uiResponseMessage[]): void {
    for (const message of messages) {
        if (message.updateDataModel) {
            const { surfaceId, path, value } = message.updateDataModel
            updateSurfaceDataModel(surfaceId, path, value, { force: true, createIfMissing: false })
        } else if (message.deleteSurface) {
            deleteSurface(message.deleteSurface.surfaceId)
        } else if (message.agentFunctionResponse) {
            // rpc 回执：值已由 callA2uiAgentFunction 返回，无需应用
        } else {
            console.warn('[A2UI] dropped unsupported response message:', Object.keys(message)[1] ?? 'unknown')
        }
    }
}

export async function handleA2UIAction(
    action: Action,
    dataModel: Record<string, any>,
    surfaceId: string,
    sourceComponentId: string
): Promise<void> {
    const surfaces = { [surfaceId]: dataModel }

    try {
        if ('event' in action) {
            const messages = await sendA2uiAction({
                surfaceId,
                name: action.event.name,
                sourceComponentId,
                // context 内的 DataBinding 绑定先解析为具体值再上送（服务端不解析渲染端数据模型）
                context: resolveDynamicRecord(action.event.context, dataModel) as Record<string, unknown>,
                surfaces,
            })
            applyResponseMessages(messages)
            return
        }

        if ('functionCall' in action) {
            const fn = action.functionCall
            const result = await callA2uiAgentFunction({
                surfaceId,
                call: fn.call,
                args: resolveDynamicRecord(fn.args, dataModel) as Record<string, unknown>,
                surfaces,
            })
            applyResponseMessages(result.messages)
            if (result.error) {
                useToast().error(`${i18n.global.t('chat.a2uiRpcError')}: ${result.error.message}`, 5000)
            }
        }
    } catch (e: any) {
        // api-client 已按静默白名单处理全局 toast；404/409 在白名单内（如旧面板已失效），
        // 此处补本地提示让用户知道点击未生效
        if (e?.code === 404 || e?.code === 409) {
            useToast().error(i18n.global.t('chat.a2uiRpcError'), 5000)
        }
        // 其余错误吞掉避免 unhandled rejection（全局 toast 已弹）
    }
}
