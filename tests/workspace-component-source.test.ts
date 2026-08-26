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
    // 移动端：接受 mobile prop，在移动模式下隐藏 splitter / 不用像素宽度
    assert.match(src, /mobile\??:\s*boolean/, 'must accept mobile prop')
    assert.match(src, /v-if="!mobile"/, 'splitter must be hidden in mobile drawer mode')
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
    // 上下文菜单 wiring
    assert.match(src, /scope:\s*'workspace'/, 'must build menu items with workspace scope')
    assert.match(src, /@contextmenu="onRowContextMenu"/, 'row must register contextmenu handler')
    assert.match(src, /lg:hidden[\s\S]{0,400}EllipsisVerticalIcon/,
        'kebab button must be mobile-only (lg:hidden + EllipsisVerticalIcon)')
    assert.match(src, /e\.stopPropagation\(\)/, 'kebab click must stop propagation to row click')
    assert.match(src, /e\.preventDefault\(\)/, 'contextmenu handler must preventDefault to suppress native menu')
    // a11y：kebab 作为菜单触发器必须被读屏器拍到
    assert.match(src, /aria-label="\$t\('workspace\.menu\.more'\)"/, 'kebab must have aria-label for screen readers')
    assert.match(src, /aria-haspopup="menu"/, 'kebab must declare aria-haspopup=menu')
})

test('WorkspaceTabFiles: toggleExpand 与 openFile 在父定义', () => {
    const src = read('src/components/workspace/WorkspaceTabFiles.vue')
    assert.match(src, /toggleExpand/, 'parent owns expand toggling')
    assert.match(src, /openFile/, 'parent owns viewer dispatch')
})

test('WorkspaceTabGit: 装配 RepoSelector + StatusGroup + HistoryList + Commit Bar', () => {
    const src = read('src/components/workspace/WorkspaceTabGit.vue')
    assert.match(src, /RepoSelector/)
    assert.match(src, /StatusGroup/)
    assert.match(src, /HistoryList/)
    assert.match(src, /useWorkspaceGit/)
    assert.match(src, /openDiff/, 'must call viewer.openDiff for status / commit clicks')
    // 底部 history 被 CollapsibleSection 包裹
    assert.match(src, /CollapsibleSection/, 'must wrap HistoryList in CollapsibleSection')
    assert.match(src, /panel\.bottomSections/, 'must read history open state from panel composable')
    // 新增：Commit Bar + 4 个 mutation
    assert.match(src, /commitMessage/, 'must bind a commit message via getCommitMessage/setCommitMessage')
    assert.match(src, /git\.commit\(/, 'must call git.commit')
    assert.match(src, /git\.stage\(/, 'must call git.stage for stage / stage all')
    assert.match(src, /git\.unstage\(/, 'must call git.unstage')
    assert.match(src, /git\.discard\(/, 'must call git.discard')
    // Ctrl/Cmd+Enter 提交
    assert.match(src, /ctrlKey \|\| e\.metaKey/, 'must support Ctrl/Cmd+Enter to commit')
    // canCommit 门：需要 message + staged > 0 + 不在 mutation 中
    assert.match(src, /canCommit/, 'must compute canCommit gating')
    assert.match(src, /stagedCount/, 'must reflect staged count in UI')
    // 各组顶部 actions
    assert.match(src, /onStageAllChanges/, 'must expose stage-all for merged Changes group')
    assert.match(src, /onUnstageAll/, 'must expose unstage-all for staged group')
    assert.match(src, /onDiscardAllChanges/, 'must expose discard-all for merged Changes group')
    // 反面锁定：合并后不应再出现 untracked 专用的 handler
    assert.doesNotMatch(src, /onDiscardAllUntracked/, 'untracked-only handler removed after merge')
    // 行右键菜单工厂
    assert.match(src, /buildGitFileMenuItems/, 'must use buildGitFileMenuItems for per-row menus')
})

test('WorkspaceTabGit: 加载 workspaceRoot + 菜单传绝对路径 + HistoryList onOpenFile', () => {
    const src = read('src/components/workspace/WorkspaceTabGit.vue')
    // 加载工作区根目录绝对路径（拼 git 文件绝对路径用）
    assert.match(src, /git\.loadWorkspaceRoot/, 'must load workspaceRoot on mount')
    assert.match(src, /git\.workspaceRoot\.value/, 'must read workspaceRoot from the git store')
    // callbacksFor 给菜单工厂传 absolutePath
    assert.match(src, /buildAbsolutePath\(git\.workspaceRoot\.value, `\$\{repo\}\/\$\{change\.path\}`\)/, 'must compose absolute path as root + repo + change.path')
    // commit 文件行也要打开工作区文件：透传 onOpenFile 给 HistoryList
    assert.match(src, /:on-open-file="openCommitFile"/, 'must pass onOpenFile to HistoryList for commit file open')
})

test('CollapsibleSection: header + body + maxHeight + count + actions slot', () => {
    const src = read('src/components/workspace/CollapsibleSection.vue')
    assert.match(src, /ChevronRightIcon/, 'must render collapsed chevron')
    assert.match(src, /ChevronDownIcon/, 'must render expanded chevron')
    assert.match(src, /maxHeight/, 'must accept maxHeight prop')
    assert.match(src, /toggle/, 'must emit toggle event')
    assert.match(src, /overflow-y-auto/, 'body must scroll internally')
    // actions slot：header 右侧可放额外按钮（如 + 文件 / + 目录）
    assert.match(src, /name="actions"/, 'must expose an actions slot for header buttons')
    // actions 不能嵌在 toggle button 内（否则点子按钮会触发折叠）
    assert.match(
        src,
        /<button[^>]+@click="onHeaderClick"[\s\S]*?<\/button>\s*<div[^>]+v-if="\$slots\.actions"/,
        'actions slot must be a sibling of the toggle button, not a child',
    )
})

test('AgentFileTreeNode: 递归、不渲染 git 徽章', () => {
    const src = read('src/components/workspace/AgentFileTreeNode.vue')
    assert.match(src, /defineOptions\(\{ name: 'AgentFileTreeNode'/, 'must declare name for self-recursion')
    assert.match(src, /<AgentFileTreeNode/, 'must self-recurse in template')
    assert.match(src, /useAgentFiles/, 'must use agent-files composable, not workspace-tree')
    assert.doesNotMatch(src, /isGitRepo/, 'must NOT render git badge in agent tree')
    // 上下文菜单 wiring：scope=agent
    assert.match(src, /scope:\s*'agent'/, 'agent tree must build menu items with agent scope')
    assert.match(src, /@contextmenu="onRowContextMenu"/, 'row must register contextmenu handler')
    assert.match(src, /lg:hidden[\s\S]{0,400}EllipsisVerticalIcon/, 'kebab button must be mobile-only')
    assert.match(src, /e\.stopPropagation\(\)/, 'kebab click must stop propagation to row click')
    assert.match(src, /e\.preventDefault\(\)/, 'contextmenu handler must preventDefault')
    // a11y：kebab 作为菜单触发器
    assert.match(src, /aria-label="\$t\('workspace\.menu\.more'\)"/, 'kebab must have aria-label for screen readers')
    assert.match(src, /aria-haspopup="menu"/, 'kebab must declare aria-haspopup=menu')
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
    // header actions slot + 行右键菜单
    assert.match(src, /name="actions"/, 'must expose actions slot for group-level buttons')
    assert.match(src, /buildItems/, 'must accept buildItems factory for per-row context menu')
    assert.match(src, /useContextMenu/, 'must wire contextmenu through useContextMenu')
    // 行内按钮：PC hover / mobile 始终可见（代替之前的 kebab）
    assert.match(src, /buildInlineActions/, 'must accept buildInlineActions factory for hover buttons')
    assert.match(src, /lg:invisible lg:group-hover:visible/, 'inline buttons must use invisible/visible (no row jitter)')
    // 明确不再使用 kebab + EllipsisVerticalIcon
    assert.doesNotMatch(src, /EllipsisVerticalIcon/, 'must NOT use kebab anymore (replaced by inline action buttons)')
})

test('HistoryList: load more + 展开 commit 文件', () => {
    const src = read('src/components/workspace/git/HistoryList.vue')
    assert.match(src, /loadMoreLog/)
    assert.match(src, /loadCommitFiles/)
    assert.match(src, /onOpenDiff/, 'must dispatch diff open to parent')
})

test('HistoryList: commit 行右键可复制完整提交信息', () => {
    const src = read('src/components/workspace/git/HistoryList.vue')
    assert.match(src, /useContextMenu/, 'history rows must use the shared workspace context menu')
    assert.match(src, /writeClipboard/, 'copy action must use the shared clipboard writer')
    assert.match(src, /formatCommitInfo\(commit\)/, 'copy action must format the full commit info')
    assert.match(src, /workspace\.git\.copyCommitInfo/, 'menu label must come from workspace git i18n')
    assert.match(src, /@contextmenu="onCommitContextMenu\(\$event, commit\)"/, 'commit row must open menu on right-click')
    assert.match(src, /catch \(err: any\)[\s\S]*toast\.error/, 'copy failures must show an error toast')
})

test('HistoryList: commit 文件行右键可打开文件/打开 diff/复制路径', () => {
    const src = read('src/components/workspace/git/HistoryList.vue')
    // commit 展开的文件行复用通用 buildGitFileMenu（与工作区/暂存区共用核心菜单）
    assert.match(src, /import \{ buildGitFileMenu[^}]*\} from ['"]\.\.\/\.\.\/\.\.\/composables\/useGitFileActions['"]/, 'must import buildGitFileMenu')
    assert.match(src, /buildAbsolutePath/, 'must import buildAbsolutePath to compose absolute path')
    // 拼绝对路径用 workspaceRoot + repo + file
    assert.match(src, /git\.workspaceRoot\.value/, 'must read workspaceRoot from the git store')
    // onOpenFile 打开工作区当前版本，由父组件透入
    assert.match(src, /onOpenFile/, 'must accept onOpenFile prop to open the working-tree version')
    // commit 文件行绑定 @contextmenu
    assert.match(src, /@contextmenu="onCommitFileContextMenu\(\$event, commit, f\)"/, 'commit file row must open menu on right-click')
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

// 防回归：SVG 预览必须走空 sandbox iframe——内嵌 <script>/事件处理器一律不执行，
// 且不得与主文档同源；将来不得“好心”加回 allow-scripts / allow-same-origin
test('WorkspaceFileView: SVG 预览走空 sandbox iframe，杜绝 XSS 面', () => {
    const src = read('src/components/workspace/WorkspaceFileView.vue')
    assert.match(src, /previewKind === 'svg'/, 'must have svg preview branch')
    const m = src.match(/previewKind === 'svg'"[\s\S]{0,200}?sandbox="([^"]*)"/)
    assert.ok(m, 'svg preview iframe must declare a sandbox attribute')
    assert.ok(!m[1].includes('allow-scripts'), 'svg sandbox must NOT allow scripts')
    assert.ok(!m[1].includes('allow-same-origin'), 'svg sandbox must NOT share origin')
    const api = read('src/composables/workspace-api.ts')
    assert.match(api, /\\\.svg\$\/i/, 'previewableExt must match .svg')
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

test('ChatHeader: 包含 RectangleGroupIcon panel toggle，PC 与移动端共用', () => {
    const src = read('src/components/chat/ChatHeader.vue')
    assert.match(src, /RectangleGroupIcon/, 'must import RectangleGroupIcon for workspace toggle')
    assert.match(src, /useWorkspacePanel/, 'must call useWorkspacePanel')
    assert.match(src, /panel\.toggle/, 'toggle button must call panel.toggle')
    // 防回归：panel toggle 不能被限定为 PC only，移动端也需要能打开 right-drawer
    assert.match(src, /v-if="chatState\.agentsSelectedId"\s+@click="panel\.toggle\(\)"/,
        'panel toggle must live outside the PC-only `hidden lg:flex` block')
    // 该按钮在选中 agent 时才显示，避免点开空 drawer
    assert.match(src, /chatState\.agentsSelectedId/, 'must hide toggle when no agent selected')
    // 负向断言：该按钮不能再携 hidden lg:inline-flex（那是之前的 PC-only 状态）
    assert.doesNotMatch(
        src,
        /hidden lg:inline-flex[^"]*"[^>]*workspace\.toggle/,
        'workspace toggle must NOT carry the PC-only `hidden lg:inline-flex` class anymore'
    )
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
    assert.doesNotMatch(src, /if \(!prev\)\s/, 'must NOT skip null→value transition with !prev guard on session watch')
    // split-view 路由下选中 session 后 panel 仍可见
    assert.match(src, /typeSelectedKey/, 'showWorkspacePanel must consider typeSelectedKey for split-view routes')
    // 移动端 drawer
    assert.match(src, /workspace-drawer/, 'must mount mobile right-drawer (id=workspace-drawer)')
    assert.match(src, /drawer-end/, 'mobile workspace drawer must slide from the right')
    assert.match(src, /:mobile="true"/, 'mobile WorkspacePanel must receive mobile prop')
    assert.match(src, /useMediaQuery/, 'must use useMediaQuery to gate viewer-auto-close behaviour')
    assert.match(src, /wsViewer\.current/, 'must watch viewer.current to auto-close drawer on mobile')
    // 防回归：isMobile 进入时强制 wsPanel.close，避免跨会话持久化的 isOpen 在 mobile 上默认盖屏
    assert.match(src, /watch\(isMobile/, 'must watch isMobile to force-close drawer when entering mobile breakpoint')
    // 防回归：mobile drawer 内容懒加载，避免未访问者付出 fetch 代价
    assert.match(src, /mobilePanelMounted/, 'mobile drawer body must be lazy-mounted on first open')
    // 全局 context menu 挂在 HomeView 根，避免被 panel/drawer overflow 裁切
    assert.match(src, /WorkspaceContextMenu|ContextMenu/, 'must mount global workspace context menu at HomeView root')
})

test('WorkspaceFileView: 向 viewer 同步 dirty 状态', () => {
    const src = read('src/components/workspace/WorkspaceFileView.vue')
    assert.match(src, /useWorkspaceViewer/, 'must read viewer composable')
    assert.match(src, /viewer\.setDirty/, 'must propagate dirty state to viewer')
})

test('WorkspaceFileView: text 模式接受 language prop 并在 loadText 优先使用', () => {
    const src = read('src/components/workspace/WorkspaceFileView.vue')
    // 接受可选 language prop（代码块全屏按 fence 语言高亮，而非内容猜）
    assert.match(src, /language\?:\s*string/, 'must accept an optional language prop for text mode')
    // loadText 必须优先用 props.language（而非仅 guessLanguageFromContent）
    assert.match(src, /props\.language/, 'loadText must prefer the language prop over content-based guess')
    // 复用共享的标签 → monaco id 解析（不内联映射表，避免与 monaco-setup 漂移）
    assert.match(src, /resolveLanguageId/, 'must resolve fence label via shared resolveLanguageId')
})

test('monaco-setup: 导出 resolveLanguageId（代码块语言标签 → monaco id，未知回退 plaintext）', () => {
    const src = read('src/components/workspace/monaco-setup.ts')
    assert.match(src, /export function resolveLanguageId/, 'must export resolveLanguageId')
    assert.match(src, /plaintext/, 'must fall back to plaintext for unknown labels')
})

test('markdown: 代码块全屏读取 fence 语言并透传给 openText', () => {
    const src = read('src/utils/markdown/markdown.ts')
    // 必须从代码块头部 .code-language 取语言（否则全屏丢失高亮）
    assert.match(src, /code-language/, 'onFullscreen must read the language from the .code-language span')
    // 仍走统一的 openText（现在带语言参数）
    assert.match(src, /openText\(/, 'must dispatch fullscreen via openText')
})
