/**
 * A2UI v1.0 renderer→agent 上行通道（HTTP RPC）。
 *
 * 通道：POST /api/a2ui/events（seedagent 核心路由）。
 * - action → 服务端面板 handler 注册表（question/questionnaire 提交）；
 * - callAgentFunction → <extensionId>.<method> → 扩展 settings.rpc（级联等 RPC 场景）；
 * - callRendererFunction 的本地执行结果经 rendererFunctionResponse 回传。
 * 响应体 { messages: agent_to_renderer[] } 由调用方应用（聊天面板 → Surface
 * 注册表；设置表单 → 本地 dataModel）。
 */

import { apiPost } from './api-client'
import { A2UI_VERSION, SEEDCLAW_BASIC_CATALOG_ID } from '../components/a2ui/types'

// 纯谓词（版本硬切 / catalog 解析）实现在零依赖的 types.ts，便于 node 原生测试
export { isSupportedA2uiMessage, isSurfaceCatalogAllowed, isComponentCatalogAllowed } from '../components/a2ui/types'

/** renderer→agent 上行端点（seedagent 核心路由） */
const A2UI_EVENTS_ENDPOINT = '/api/a2ui/events'

/** 响应 messages 过滤：仅接受 v1.0 envelope（防御非协议内容混入应用链）；非空输入全部被滤掉时告警 */
function filterResponseMessages(messages: unknown): A2uiResponseMessage[] {
    if (!Array.isArray(messages)) return []
    const filtered = messages.filter((m): m is A2uiResponseMessage =>
        m != null && typeof m === 'object' && (m as { version?: unknown }).version === A2UI_VERSION)
    if (messages.length > 0 && filtered.length === 0) {
        console.warn('[A2UI] response messages all rejected by version filter:', messages)
    }
    return filtered
}

// ==================== HTTP 上行 ====================

export interface A2uiResponseMessage {
    version: string
    updateDataModel?: { surfaceId: string; path?: string; value: any }
    updateComponents?: { surfaceId: string; components: unknown[] }
    deleteSurface?: { surfaceId: string }
    agentFunctionResponse?: { functionCallId: string; value?: any; error?: { code: string; message: string } }
    callRendererFunction?: { functionCallId: string; callFunction: { call: string; args?: Record<string, unknown>; catalogId: string } }
    [key: string]: any
}

function newCallId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `call-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 面板 action 上送；响应 messages 交调用方应用 */
export async function sendA2uiAction(input: {
    surfaceId: string
    name: string
    sourceComponentId: string
    context: Record<string, unknown>
    surfaces: Record<string, Record<string, any>>
}): Promise<A2uiResponseMessage[]> {
    const payload = await apiPost<{ messages?: A2uiResponseMessage[] }>(A2UI_EVENTS_ENDPOINT, {
        version: A2UI_VERSION,
        action: {
            name: input.name,
            surfaceId: input.surfaceId,
            sourceComponentId: input.sourceComponentId,
            timestamp: new Date().toISOString(),
            context: input.context,
        },
        surfaces: input.surfaces,
    })
    return filterResponseMessages(payload?.messages)
}

/** callAgentFunction RPC；返回首个匹配 functionCallId 的响应值 + 随行 messages */
export async function callA2uiAgentFunction(input: {
    surfaceId: string
    call: string
    args: Record<string, unknown>
    surfaces: Record<string, Record<string, any>>
}): Promise<{ value?: any; error?: { code: string; message: string }; messages: A2uiResponseMessage[] }> {
    const functionCallId = newCallId()
    const payload = await apiPost<{ messages?: A2uiResponseMessage[] }>(A2UI_EVENTS_ENDPOINT, {
        version: A2UI_VERSION,
        callAgentFunction: {
            surfaceId: input.surfaceId,
            functionCallId,
            callFunction: {
                function: input.call,
                args: input.args,
                catalogId: SEEDCLAW_BASIC_CATALOG_ID,
            },
        },
        surfaces: input.surfaces,
    })
    const messages = filterResponseMessages(payload?.messages)
    const response = messages.find((m) => m.agentFunctionResponse?.functionCallId === functionCallId)
    // 区分三态：显式 error / 成功 value / 服务端未回带对应 functionCallId（NO_RESPONSE）。
    // 注意成功响应无 error 字段，不得用 ?? 兑底（否则成功也会误报错误）。
    const receipt = response?.agentFunctionResponse
    return {
        value: receipt?.value,
        error: receipt ? receipt.error : { code: 'NO_RESPONSE', message: `no agentFunctionResponse for call ${input.call}` },
        messages,
    }
}

/** callRendererFunction 的本地执行结果回传（当前无业务挂起方，服务端记录即空响应） */
export async function sendA2uiRendererFunctionResponse(input: {
    functionCallId: string
    value?: unknown
    error?: { code: string; message: string }
}): Promise<void> {
    await apiPost(A2UI_EVENTS_ENDPOINT, {
        version: A2UI_VERSION,
        rendererFunctionResponse: {
            functionCallId: input.functionCallId,
            ...(input.error ? { error: input.error } : { value: input.value }),
        },
    })
}
