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
    assert.match(src, /openFile/, 'must call viewer.openFile when clicking a file')
    assert.match(src, /FileTreeNode/, 'must render recursive FileTreeNode component')
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
    assert.match(src, /FileView/, 'must reuse FileView for file mode')
    assert.match(src, /DiffViewer/, 'must use DiffViewer for diff mode')
    assert.match(src, /Escape/, 'must support Esc to close')
})

test('DiffViewer: hljs diff 高亮 + truncated banner + binary 占位', () => {
    const src = read('src/components/workspace/DiffViewer.vue')
    assert.match(src, /hljs/, 'must use highlight.js')
    assert.match(src, /truncated/, 'must show truncated banner')
    assert.match(src, /binary/, 'must show binary placeholder')
    assert.match(src, /fetchDiff/, 'must fetch diff via workspace-api')
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
})
