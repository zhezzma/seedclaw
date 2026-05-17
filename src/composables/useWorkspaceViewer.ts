/**
 * Workspace Viewer 模式状态：决定聊天区是显示聊天还是显示 file/diff。
 *
 * 通过 useWorkspaceViewer().openFile() / openDiff() 进入；close() 退出。
 */
import { computed, ref } from 'vue'
import { useWorkspaceGit } from './useWorkspaceGit.ts'
import type { DiffMode } from './workspace-api.ts'

export type ViewerTarget =
    | { type: 'file'; path: string }
    | { type: 'diff'; repo: string; mode: DiffMode; file: string; ref?: string }

const current = ref<ViewerTarget | null>(null)

const _viewerState = {
    current,
    isActive: computed(() => current.value !== null),
    openFile(path: string) {
        current.value = { type: 'file', path }
    },
    openDiff(args: { repo: string; mode: DiffMode; file: string; ref?: string }) {
        current.value = { type: 'diff', repo: args.repo, mode: args.mode, file: args.file, ref: args.ref }
    },
    close() {
        const wasActive = current.value !== null
        current.value = null
        // spec §6.4: Viewer 关闭后仅刷新 status。
        // 实现上只标“过期”，下次 WorkspaceTabGit onMounted 的缓存检查会触发重拉。
        // 这样不论 Git tab 是否当前挂载，下次返回 Git tab 都会拿到新数据。
        if (wasActive) {
            useWorkspaceGit().markStatusStale()
        }
    },
}

export const useWorkspaceViewer = () => _viewerState
