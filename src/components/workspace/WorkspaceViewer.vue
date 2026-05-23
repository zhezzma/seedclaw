<script setup lang="ts">
/**
 * Viewer 模式容器：替换聊天区显示文件内容或 diff。
 *
 * 头部：
 * - 返回（带 dirty 确认）
 * - 面包屑（dirty 圆点提示）
 * - file 模式：Save 按钮（dirty 时高亮，readOnly 时禁用）
 * - diff 模式：Split/Inline toggle
 *
 * 快捷键：
 * - Esc 关闭（带 dirty 确认）
 * - Ctrl/Cmd+S 保存（由 WorkspaceFileView 内部 monaco command 处理）
 *
 * 路由：
 * - target.type === 'file' → WorkspaceFileView (默认就能编辑，VSCode 风格)
 * - target.type === 'diff' → WorkspaceDiffEditor (monaco diff editor)
 */
import { onMounted, onUnmounted, computed, ref, watch, nextTick, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    ArrowLeftIcon,
    DocumentCheckIcon,
    EyeIcon,
    EyeSlashIcon,
    ViewColumnsIcon,
    Bars3Icon,
} from '@heroicons/vue/24/outline'
import WorkspaceFileView from './WorkspaceFileView.vue'
import WorkspaceDiffEditor from './WorkspaceDiffEditor.vue'
import { useWorkspaceViewer } from '../../composables/useWorkspaceViewer'
import { useConfirm } from '../../composables/useConfirm'

const props = defineProps<{ agentId: string }>()
const viewer = useWorkspaceViewer()
const { confirm } = useConfirm()
const { t } = useI18n()

const rootRef = ref<HTMLDivElement | null>(null)
const fileViewRef = useTemplateRef<InstanceType<typeof WorkspaceFileView>>('fileViewRef')
const diffViewRef = useTemplateRef<InstanceType<typeof WorkspaceDiffEditor>>('diffViewRef')

const target = computed(() => viewer.current.value)

const breadcrumb = computed(() => {
    const tgt = target.value
    if (!tgt) return ''
    if (tgt.type === 'file') return tgt.path
    if (tgt.type === 'agent-file') return `agent / ${tgt.path}`
    if (tgt.type === 'diff') {
        const sha = tgt.ref ? ` @ ${tgt.ref.slice(0, 7)}` : ''
        return `${tgt.repo} / ${tgt.file}${sha}`
    }
    return ''
})

// ── file 模式按钮状态：通过 fileViewRef.value 直接读 expose 的 ref ──
const isFileMode = computed(() =>
    target.value?.type === 'file' || target.value?.type === 'agent-file',
)
const fileIsDirty = computed(() => fileViewRef.value?.isDirty ?? false)
const fileIsSaving = computed(() => fileViewRef.value?.isSaving ?? false)
const fileIsReadOnly = computed(() => fileViewRef.value?.isReadOnly ?? false)
const fileSaveDisabled = computed(() =>
    fileIsReadOnly.value || fileIsSaving.value || !fileIsDirty.value,
)

// 预览按钮：仅在当前文件是 .html/.htm/.md/.markdown 时显示。
// 避免按钮常驻 disable 造成视觉噪音。
function previewableExt(path: string): 'html' | 'md' | null {
    if (/\.html?$/i.test(path)) return 'html'
    if (/\.(md|markdown)$/i.test(path)) return 'md'
    return null
}
const previewKind = computed(() => {
    const tgt = target.value
    if (!tgt || (tgt.type !== 'file' && tgt.type !== 'agent-file')) return null
    return previewableExt(tgt.path)
})
const showPreviewButton = computed(() => previewKind.value !== null)
const filePreviewMode = computed(() => fileViewRef.value?.previewMode ?? false)

// ── diff 模式按钮状态 ──
const diffSideBySide = computed(() => diffViewRef.value?.sideBySide ?? true)

async function confirmDiscardIfDirty(): Promise<boolean> {
    if (!isFileMode.value) return true
    if (!fileIsDirty.value) return true
    return await confirm(t('workspace.unsavedChanges'), t('common.confirm'))
}

async function close() {
    if (!await confirmDiscardIfDirty()) return
    viewer.close()
}

async function onClickSave() {
    if (!fileViewRef.value) return
    await fileViewRef.value.save()
}

function onClickPreview() {
    // .md 点击无反应（占位）；HTML 切换 previewMode。
    if (previewKind.value !== 'html') return
    fileViewRef.value?.togglePreview()
}

function onClickToggleSplit() {
    diffViewRef.value?.toggleSideBySide()
}

async function onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (e.isComposing) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    await close()
}

/** 全局 Ctrl/Cmd+S：monaco 的 addCommand 仅在 editor 获焦时生效，
 *  用户点过面包屑 / Save 按钮区 / 刚切完 tree 等场景下焦点不在 editor，
 *  默认 Ctrl+S 会被浏览器吃授成“保存网页”，这里在 viewer 范围内兼负。 */
async function onSaveShortcut(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.key !== 's' && e.key !== 'S') return
    if (e.isComposing) return
    if (!isFileMode.value) return
    e.preventDefault()
    await fileViewRef.value?.save()
}

async function focusRoot() {
    await nextTick()
    rootRef.value?.focus()
}

onMounted(() => {
    document.addEventListener('keydown', onEscape)
    document.addEventListener('keydown', onSaveShortcut)
    focusRoot()
})
onUnmounted(() => {
    document.removeEventListener('keydown', onEscape)
    document.removeEventListener('keydown', onSaveShortcut)
})

// 切换 target 时重新 focus，避免中途用户点过 ChatInput textarea 导致 Esc 被 textarea 吞掉。
watch(target, () => {
    if (target.value) focusRoot()
})
</script>

<template>
    <div ref="rootRef" tabindex="-1" role="region" :aria-label="breadcrumb || $t('workspace.tabFiles')"
        class="flex flex-col h-full bg-base-100 outline-none">
        <div class="flex items-center gap-2 p-2 border-b border-base-200 shrink-0">
            <button class="btn btn-ghost btn-sm btn-circle" :title="$t('common.back')" @click="close()">
                <ArrowLeftIcon class="h-5 w-5" />
            </button>
            <div class="flex-1 min-w-0 truncate text-sm font-mono text-base-content/70">
                {{ breadcrumb }}
                <span v-if="isFileMode && fileIsDirty" class="text-warning ml-1">●</span>
            </div>

            <!-- file 模式：Save + （按需）Preview；workspace 与 agent 两种 scope 共用 -->
            <template v-if="isFileMode">
                <button v-if="showPreviewButton" class="btn btn-sm gap-1"
                    :class="filePreviewMode ? 'btn-primary' : 'btn-ghost'"
                    :title="filePreviewMode ? $t('workspace.previewExit') : $t('workspace.preview')"
                    @click="onClickPreview">
                    <EyeSlashIcon v-if="filePreviewMode" class="h-4 w-4" />
                    <EyeIcon v-else class="h-4 w-4" />
                    <span class="hidden md:inline text-xs">
                        {{ filePreviewMode ? $t('workspace.previewExit') : $t('workspace.preview') }}
                    </span>
                </button>
                <button class="btn btn-sm gap-1"
                    :class="fileIsDirty && !fileIsReadOnly ? 'btn-primary' : 'btn-ghost'"
                    :disabled="fileSaveDisabled" :title="$t('workspace.save') + ' (Ctrl+S)'"
                    @click="onClickSave">
                    <DocumentCheckIcon class="h-4 w-4" />
                    <span class="hidden md:inline text-xs">
                        {{ fileIsSaving ? $t('workspace.saving') : $t('workspace.save') }}
                    </span>
                </button>
            </template>

            <!-- diff 模式按钮：Split / Inline 切换 -->
            <template v-else-if="target?.type === 'diff'">
                <button class="btn btn-ghost btn-sm gap-1"
                    :title="diffSideBySide ? $t('workspace.diffInline') : $t('workspace.diffSplit')"
                    @click="onClickToggleSplit">
                    <ViewColumnsIcon v-if="!diffSideBySide" class="h-4 w-4" />
                    <Bars3Icon v-else class="h-4 w-4" />
                    <span class="hidden md:inline text-xs">
                        {{ diffSideBySide ? $t('workspace.diffInline') : $t('workspace.diffSplit') }}
                    </span>
                </button>
            </template>
        </div>

        <div class="flex-1 min-h-0 overflow-hidden">
            <WorkspaceFileView v-if="target?.type === 'file'" ref="fileViewRef" :agent-id="agentId"
                :path="target.path" scope="workspace" />
            <WorkspaceFileView v-else-if="target?.type === 'agent-file'" ref="fileViewRef" :agent-id="agentId"
                :path="target.path" scope="agent" />
            <WorkspaceDiffEditor v-else-if="target?.type === 'diff'" ref="diffViewRef" :agent-id="agentId"
                :repo="target.repo" :mode="target.mode" :file="target.file" :ref-sha="target.ref" />
        </div>
    </div>
</template>
