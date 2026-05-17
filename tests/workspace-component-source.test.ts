import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))

function read(rel: string): string {
    return readFileSync(path.resolve(dir, '..', rel), 'utf8')
}

test('WorkspacePanel: 包含 tab 切换、splitter、close 与 width 应用', () => {
    const src = read('src/components/workspace/WorkspacePanel.vue')
    assert.match(src, /useWorkspacePanel/, 'WorkspacePanel must use the panel composable')
    assert.match(src, /WorkspaceTabFiles/, 'must render WorkspaceTabFiles')
    assert.match(src, /WorkspaceTabGit/, 'must render WorkspaceTabGit')
    assert.match(src, /role="tab"|tab-group|tab tab-/, 'must have tab UI')
    assert.match(src, /col-resize/, 'splitter must use col-resize cursor')
    assert.match(src, /:style=".*width/, 'panel width must bind from composable')
})

test('WorkspaceTabFiles: 调用 tree composable + viewer.openFile', () => {
    const src = read('src/components/workspace/WorkspaceTabFiles.vue')
    assert.match(src, /useWorkspaceTree/)
    assert.match(src, /useWorkspaceViewer/)
    assert.match(src, /openFile\(entry\.path\)/, 'must call viewer.openFile with workspace-relative path')
    assert.match(src, /FileTreeNode/, 'must render recursive FileTreeNode component')
    // 底部 agent files 可折叠区
    assert.match(src, /useAgentFiles/, 'must use agent-files composable')
    assert.match(src, /CollapsibleSection/, 'must use shared CollapsibleSection')
    assert.match(src, /openAgentFile/, 'must dispatch viewer.openAgentFile for agent entries')
    assert.match(src, /AgentFileTreeNode/, 'must render AgentFileTreeNode for agent dir')
    // 防回归：点击 tree 切文件前需要 dirty 确认
    assert.match(src, /useConfirm/, 'must import useConfirm to gate file switching when viewer is dirty')
    assert.match(src, /viewer\.dirty/, 'must read viewer.dirty before switching files')
    assert.match(src, /confirmIfDirty/, 'must guard openFile / openAgentFile with confirmIfDirty')
})

test('FileTreeNode: 递归、区分 file/dir/symlink、isGitRepo 徽章', () => {
    const src = read('src/components/workspace/FileTreeNode.vue')
    assert.match(src, /defineOptions\(\{ name: 'FileTreeNode'/, 'must declare name for self-recursion')
    assert.match(src, /isGitRepo/, 'must render git repo badge')
    assert.match(src, /symlink/, 'must handle symlink type')
    assert.match(src, /<FileTreeNode/, 'must self-recurse in template')
    assert.match(src, /onClick\(entry\)|onClick\(props\.entry\)/, 'must dispatch click to parent')
})

test('WorkspaceTabFiles: toggleExpand 与 openFile 在父定义', () => {
    const src = read('src/components/workspace/WorkspaceTabFiles.vue')
    assert.match(src, /toggleExpand/, 'parent owns expand toggling')
    assert.match(src, /openFile/, 'parent owns viewer dispatch')
})

test('WorkspaceTabGit: 装配 RepoSelector + StatusGroup + HistoryList', () => {
    const src = read('src/components/workspace/WorkspaceTabGit.vue')
    assert.match(src, /RepoSelector/)
    assert.match(src, /StatusGroup/)
    assert.match(src, /HistoryList/)
    assert.match(src, /useWorkspaceGit/)
    assert.match(src, /openDiff/, 'must call viewer.openDiff for status / commit clicks')
    // 底部 history 被 CollapsibleSection 包裹
    assert.match(src, /CollapsibleSection/, 'must wrap HistoryList in CollapsibleSection')
    assert.match(src, /panel\.bottomSections/, 'must read history open state from panel composable')
})

test('CollapsibleSection: header + body + maxHeight + count', () => {
    const src = read('src/components/workspace/CollapsibleSection.vue')
    assert.match(src, /ChevronRightIcon/, 'must render collapsed chevron')
    assert.match(src, /ChevronDownIcon/, 'must render expanded chevron')
    assert.match(src, /maxHeight/, 'must accept maxHeight prop')
    assert.match(src, /toggle/, 'must emit toggle event')
    assert.match(src, /overflow-y-auto/, 'body must scroll internally')
})

test('AgentFileTreeNode: 递归、不渲染 git 徽章', () => {
    const src = read('src/components/workspace/AgentFileTreeNode.vue')
    assert.match(src, /defineOptions\(\{ name: 'AgentFileTreeNode'/, 'must declare name for self-recursion')
    assert.match(src, /<AgentFileTreeNode/, 'must self-recurse in template')
    assert.match(src, /useAgentFiles/, 'must use agent-files composable, not workspace-tree')
    assert.doesNotMatch(src, /isGitRepo/, 'must NOT render git badge in agent tree')
})

test('RepoSelector: 显示分支徽章 + ahead/behind + dropdown', () => {
    const src = read('src/components/workspace/git/RepoSelector.vue')
    assert.match(src, /["' ]relative["' ]/i, 'should use a dropdown anchor (relative position) for repo selection')
    assert.match(src, /absolute/i, 'dropdown menu must be absolutely positioned')
    assert.match(src, /ahead/, 'should show ahead count')
    assert.match(src, /behind/, 'should show behind count')
    assert.match(src, /dirty/, 'should show dirty count')
})

test('StatusGroup: 三组渲染 + 状态字符 colorMap', () => {
    const src = read('src/components/workspace/git/StatusGroup.vue')
    assert.match(src, /statusClass/, 'must map status char to color class')
    assert.match(src, /text-warning|text-error|text-success/, 'must use semantic color classes')
    assert.match(src, /onClick/, 'click row should dispatch back to parent')
    assert.match(src, /oldPath/, 'must render rename arrow')
})

test('HistoryList: load more + 展开 commit 文件', () => {
    const src = read('src/components/workspace/git/HistoryList.vue')
    assert.match(src, /loadMoreLog/)
    assert.match(src, /loadCommitFiles/)
    assert.match(src, /onOpenDiff/, 'must dispatch diff open to parent')
})

test('WorkspaceViewer: 通过 type 切换 file vs diff', () => {
    const src = read('src/components/workspace/WorkspaceViewer.vue')
    assert.match(src, /useWorkspaceViewer/)
    assert.match(src, /WorkspaceFileView/, 'must use WorkspaceFileView for file mode')
    assert.match(src, /WorkspaceDiffEditor/, 'must use WorkspaceDiffEditor for diff mode')
    assert.match(src, /Escape/, 'must support Esc to close')
    // 防回归：全局 Ctrl/Cmd+S 快捷键（monaco addCommand 仅在编辑器获焦时生效，
    // 这里补充 viewer 范围内任意焦点都能响应）
    assert.match(src, /onSaveShortcut|ctrlKey.*metaKey|metaKey.*ctrlKey/,
        'must register a viewer-scoped Ctrl/Cmd+S handler')
    assert.match(src, /'keydown'/, 'must register keydown listener for shortcuts')
})

test('WorkspaceFileView: 默认可编辑 + 保存 + dirty 追踪，无 view/edit toggle', () => {
    const src = read('src/components/workspace/WorkspaceFileView.vue')
    assert.match(src, /fetchFile/, 'must fetch via agent-scoped API')
    assert.match(src, /saveFile/, 'must call saveFile')
    assert.match(src, /isDirty/, 'must track dirty state')
    assert.match(src, /KeyS/, 'must register Ctrl/Cmd+S save shortcut')
    assert.match(src, /defineExpose/, 'must expose state to parent (WorkspaceViewer)')
    // 明确不要 toggle 交互（VSCode 风格：默认就能编辑）
    assert.doesNotMatch(src, /toggleEdit/, 'must NOT expose toggleEdit (no view/edit mode toggle)')
    assert.doesNotMatch(src, /isEditing/, 'must NOT track isEditing flag')
    // scope=workspace|agent 双模式
    assert.match(src, /scope/, 'must accept scope prop for workspace/agent file routing')
    assert.match(src, /fetchAgentFile/, 'must support agent scope')
    assert.match(src, /saveAgentFile/, 'must save via agent scope endpoint')
    // 防回归：save() 必须带 loading guard，避免 load 窗口内写旧内容到新路径
    assert.match(src, /loading\.value/, 'save() must guard against in-flight load')
    // 防回归：props 变化必须同步重置 content/baseline，避免 viewer.dirty 错挂新路径
    assert.match(
        src,
        /watch\(\(\) => \[props\.agentId, props\.path[^]+?content\.value = ''[^]+?baselineContent\.value = ''/,
        'switching props must reset content/baseline before loadFile'
    )
    // 防回归：fetch 期间 editor 临时只读（避免输入被 setValue 覆盖）
    assert.match(src, /editor\?\.updateOptions\(\{ readOnly: true \}\)/,
        'must temporarily set readOnly during load to avoid losing edits')
})

test('WorkspaceDiffEditor: monaco diff editor + split/inline 切换', () => {
    const src = read('src/components/workspace/WorkspaceDiffEditor.vue')
    assert.match(src, /createDiffEditor/, 'must use monaco.editor.createDiffEditor')
    assert.match(src, /fetchFileVersions/, 'must fetch both sides via file-versions endpoint')
    assert.match(src, /renderSideBySide/, 'must support side-by-side toggle')
    assert.match(src, /sideBySide/, 'must expose split/inline state')
    assert.match(src, /binary/, 'must show binary placeholder')
    assert.match(src, /truncated/, 'must show truncated banner')
    // 明确不走 hljs / unified-text fallback
    assert.doesNotMatch(src, /hljs/, 'must NOT fall back to hljs unified diff')
})

test('ChatHeader: 包含 RectangleGroupIcon panel toggle (PC only)', () => {
    const src = read('src/components/chat/ChatHeader.vue')
    assert.match(src, /RectangleGroupIcon/, 'must import RectangleGroupIcon for workspace toggle')
    assert.match(src, /useWorkspacePanel/, 'must call useWorkspacePanel')
    assert.match(src, /panel\.toggle/, 'toggle button must call panel.toggle')
    assert.match(src, /hidden lg:flex|hidden lg:inline-flex/, 'toggle must be PC only')
})

test('HomeView: 接入 WorkspacePanel + WorkspaceViewer + 快捷键', () => {
    const src = read('src/views/HomeView.vue')
    assert.match(src, /WorkspacePanel/)
    assert.match(src, /WorkspaceViewer/)
    assert.match(src, /useWorkspacePanel/)
    assert.match(src, /useWorkspaceViewer/)
    assert.match(src, /handleWorkspaceShortcut/, 'must register keyboard shortcut handler')
    assert.match(src, /metaKey|ctrlKey/, 'shortcut must accept Ctrl/Meta modifier')
    // session/agent 切换 → 关闭 viewer（带 dirty toast）
    assert.match(src, /chatState\.sessionKey/, 'must watch sessionKey')
    assert.match(src, /chatState\.agentsSelectedId/, 'must also watch agentsSelectedId (for /new agent dropdown)')
    assert.match(src, /wsViewer\.close\(\)/, 'session/agent switch must close viewer')
    assert.match(src, /discardedDirty/, 'must toast discardedDirty when closing dirty viewer')
    // 明确不走 !prev 过滤 —— null→realKey 是合法切换
    assert.doesNotMatch(src, /if \(!prev\)\s/, 'must NOT skip null→value transition with !prev guard on session watch')
    // split-view 路由下选中 session 后 panel 仍可见
    assert.match(src, /typeSelectedKey/, 'showWorkspacePanel must consider typeSelectedKey for split-view routes')
})

test('WorkspaceFileView: 向 viewer 同步 dirty 状态', () => {
    const src = read('src/components/workspace/WorkspaceFileView.vue')
    assert.match(src, /useWorkspaceViewer/, 'must read viewer composable')
    assert.match(src, /viewer\.setDirty/, 'must propagate dirty state to viewer')
})
