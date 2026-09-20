/**
 * 分支尾锚计算：逐条判断显示列表中的消息是否是「分支尾部锚点」——user 消息且
 * 紧随其后的显示项不是本回合 assistant 回复（含末项，next 为 undefined）。
 *
 * 为什么需要：分支导航 UI 只挂在 assistant footer 上，而分支尾部可能没有任何
 * 已渲染的 assistant 回复（用户停止产生的空 aborted 消息按设计零渲染、回复被
 * 删光），该分支唯一必现的锚点是 user 消息；分支被续写后（新消息按
 * SessionManager.appendMessage 的 leafId 语义挂在空 aborted 之下）分叉点 user
 * 消息也不再是显示列表末项。两种场景下 user 气泡必须承担导航锚点，否则切到
 * 该分支后无任何导航/操作可逃逸。
 *
 * 为什么不是「所有 user 消息」：下一项就是本回合 assistant 回复的正常回合，
 * 导航由 assistant 气泡提供，user 侧再挂一份会对同一回合重复渲染 n/n 计数器。
 *
 * 已知瞬态窗口不成立（稳态即恢复，与 assistant 侧导航在 busy 时的既有暴露
 * 一致）：流式占位气泡与压缩指示行是 assistant 角色，会短暂压制其前的 user
 * 锚点；排队中的 steer/follow-up 气泡是 user 角色，不影响尾锚判定。
 */

/** 最小消息形状：只需要 role 参与判定（DisplayMessage / 排队气泡均满足） */
export interface BranchTailMessageLike {
    role: string
}

export const computeBranchTailFlags = (messages: BranchTailMessageLike[]): boolean[] =>
    messages.map((msg, i) => msg.role === 'user' && messages[i + 1]?.role !== 'assistant')
