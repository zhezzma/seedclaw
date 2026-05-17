/**
 * Workspace Viewer 模式状态：决定聊天区是显示聊天还是显示 file/diff。
 *
 * 通过 useWorkspaceViewer().openFile() / openDiff() 进入；close() 退出。
 *
 * 路径语义：openFile(path) 传的是**相对于当前 agent workspace** 的路径；agentId 从
 * WorkspaceViewer 组件 props 接入，不编码进 target。
 */
import { computed, ref } from 'vue'
import { useWorkspaceGit } from './useWorkspaceGit.ts'
import type { DiffMode } from './workspace-api.ts'

export type ViewerTarget =
    | { type: 'file'; path: string }
    | { type: 'agent-file'; path: string }
    | { type: 'diff'; repo: string; mode: DiffMode; file: string; ref?: string }

const current = ref<ViewerTarget | null>(null)

/**
 * 全局 dirty 状态：WorkspaceFileView 在自己内容与 baseline 不一致时写入路径，清净时写 null。
 * 供跨组件（如 HomeView session 切换）检查有无未保存改动 + 提示丢弃。
 * 取 ref（而非仅依赖 fileView ref 链）是为了跨路由/跨 view 都能读到。
 */
const dirty = ref<{ path: string } | null>(null)

const _viewerState = {
    current,
    isActive: computed(() => current.value !== null),
    dirty,
    openFile(path: string) {
        current.value = { type: 'file', path }
    },
    /** 打开 agent 配置目录下的文件（agent-tree 点击）。 */
    openAgentFile(path: string) {
        current.value = { type: 'agent-file', path }
    },
    openDiff(args: { repo: string; mode: DiffMode; file: string; ref?: string }) {
        current.value = { type: 'diff', repo: args.repo, mode: args.mode, file: args.file, ref: args.ref }
    },
    /** WorkspaceFileView 专用：跟随自身 isDirty + path 同步。 */
    setDirty(path: string | null) {
        dirty.value = path ? { path } : null
    },
    close() {
        const wasActive = current.value !== null
        current.value = null
        dirty.value = null
        // spec §6.4: Viewer 关闭后仅刷新 status。
        // 实现上只标“过期”，下次 WorkspaceTabGit onMounted 的缓存检查会触发重拉。
        // 这样不论 Git tab 是否当前挂载，下次返回 Git tab 都会拿到新数据。
        if (wasActive) {
            useWorkspaceGit().markStatusStale()
        }
    },
}

export const useWorkspaceViewer = () => _viewerState
