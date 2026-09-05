/**
 * 助手消息 blocks 的稳定键推导。
 *
 * 背景：processedMessages 是 computed，流式期间每个 delta 都从头重建整个 blocks
 * 数组（新对象引用），MessageBubble 的 v-for 不能用对象引用做 key；纯索引做 key
 * 在中段插入块（如流式 a2ui 文本分裂为 [text, a2ui, text]）时会导致后续所有块索引
 * 平移，状态子组件（ThinkingBlock 的展开、ToolInvocation 的开合）被卸载重挂、状态丢失。
 *
 * 键规则（纯数据推导，对追加增长/每帧重建/中段分裂三种变异模式均稳定）：
 * - tool  → `tool-{toolCallId}`（后端全局唯一）
 * - a2ui  → `a2ui-{surfaceId}`（surface 生命周期唯一）
 * - 其余（text/thinking/image_gallery/a2ui_loading/error/unknown/a2ui-action）
 *        → `{type}-{类型内序号}`：异类块插入不改变同类块的类型内序号，
 *          状态正需要保存在 thinking/tool 这类块上
 * - 重复键（如刷新重连后历史快照与流式重放各含同 id 的僵尸工具块）追加 `~n` 去重，
 *   保 Vue key 唯一性约束。
 *
 * 设计边界（同类块前插→序号平移）：键方案对异类插入稳定，对同类前插必然平移，
 * 但当前流式数据流中不可达——所有变异都是尾部追加或就地赋值（useChatState 的
 * push/append；useChatMessages 的 merge blocks.push 尾拼/尾部 error push），
 * 唯一的中段变异（a2ui 文本分裂）只发生在活跃尾块，其后无块。
 *
 * 理论碰撞：若 toolCallId 恰为纯数字（如 "0"），`tool-0` 会与无 id tool 块的序号键
 * 撞车，靠 `~n` 兜底唯一。实际不可达（服务端 id 非纯数字样式）。
 */
export interface KeyedBlock {
    type: string
    toolCallId?: string
    a2uiSurfaceId?: string
}

export function computeBlockKeys(blocks: KeyedBlock[]): string[] {
    const counters = new Map<string, number>()
    const used = new Set<string>()
    const keys: string[] = []

    for (const block of blocks) {
        let key: string
        if (block.type === 'tool' && block.toolCallId) {
            key = `tool-${block.toolCallId}`
        } else if (block.type === 'a2ui' && block.a2uiSurfaceId) {
            key = `a2ui-${block.a2uiSurfaceId}`
        } else {
            const n = counters.get(block.type) || 0
            counters.set(block.type, n + 1)
            key = `${block.type}-${n}`
        }

        if (used.has(key)) {
            let dup = 2
            while (used.has(`${key}~${dup}`)) dup++
            key = `${key}~${dup}`
        }
        used.add(key)
        keys.push(key)
    }

    return keys
}
