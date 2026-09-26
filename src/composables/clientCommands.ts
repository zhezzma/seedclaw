import type { CommandInfo } from './useCommandState'

// ==================== 客户端命令统一注册表 ====================
// 客户端命令 = 前端本地拦截处理、不经服务端的命令（如 /todos 重现任务清单面板、
// /tree 打开会话树；服务端命令表 /api/commands 不含它们，故 / 补全需前端合并）。
// 本注册表是唯一事实来源，两处消费：
//   1. `/` 补全浮层：useChatInput 的 watch 按前缀合并（按 name 去重，防服务端未来同名下发）
//   2. 「命令」按钮下拉：ChatInput 渲染为「本地指令」分区
// 新增客户端命令只需在此追加一条，两处自动可见；HomeView 等调用方仍各自负责拦截执行。

/** 客户端命令 = CommandInfo + 下拉条目元数据 */
export interface ClientCommand extends CommandInfo {
    /** 「命令」下拉显示文案（如 '/todos (任务清单)'）；缺省用 `/${name}` */
    dropdownLabel?: string
    /** 下拉选中后是否自动发送；缺省跟随全局 autoSendCommands 设置（与 CommandItem.autoSend 语义一致） */
    autoSend?: boolean
}

export const CLIENT_COMMANDS: ClientCommand[] = [
    { name: 'todos', description: '任务清单面板', source: 'client', dropdownLabel: '/todos (任务清单)' },
    { name: 'tree', description: '会话树', source: 'client', dropdownLabel: '/tree (会话树)' },
]

/** 按输入前缀（不含 `/`）过滤客户端命令 → 纯 CommandInfo（供 / 补全合并） */
export const filterClientCommands = (prefix: string): CommandInfo[] =>
    CLIENT_COMMANDS
        .filter(cmd => cmd.name.toLowerCase().startsWith(prefix.toLowerCase()))
        .map(cmd => ({ name: cmd.name, description: cmd.description, source: cmd.source }))
