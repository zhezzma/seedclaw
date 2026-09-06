<script setup lang="ts">
/**
 * 工作区改绑弹窗：传入 agentId，恒为单阶段。
 * - WorkspacePathField 校验路径（含 bound-agent 提示 / 信任区块）；
 * - 「更新绑定」→ updateAgent（PATCH workspaceDir，空串传 null 清除绑定）→ emit updated。
 */
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { XMarkIcon, FolderOpenIcon } from "@heroicons/vue/24/outline";
import WorkspacePathField from "./WorkspacePathField.vue";
import { useAgentsState } from "../../composables/useAgentsState";
import { useToast } from "../../composables/useToast";
import type { WorkspaceResolvePayload } from "../../composables/useWorkspaceBinding";

const props = defineProps<{
    show: boolean;
    /** 要改绑的智能体（必传：本弹窗现仅服务 AgentOverview 的改绑流程） */
    agentId: string;
}>();
const emit = defineEmits<{
    (e: "close"): void;
    /** rebind PATCH 成功 */
    (e: "updated", workspaceDir: string | null): void;
}>();

const { t } = useI18n();
const agentsState = useAgentsState();
const toast = useToast();

const path = ref("");
const isBusy = ref(false);
// 最近一次路径校验结果（null = 未校验/失败），「更新绑定」以非空门控
const lastResult = ref<WorkspaceResolvePayload | null>(null);

watch(() => props.show, (v) => { if (v) { path.value = ""; lastResult.value = null; } });

const onValidated = ({ result }: { basename: string; result: WorkspaceResolvePayload | null }) => {
    lastResult.value = result;
};

async function doRebind() {
    isBusy.value = true;
    try {
        await agentsState.updateAgent({ agentId: props.agentId, workspaceDir: path.value.trim() || null });
        emit("updated", path.value.trim() || null);
        emit("close");
    } catch (e: any) {
        toast.error(e?.message || String(e));
    } finally { isBusy.value = false; }
}
</script>

<template>
    <div :class="{ modal: true, 'modal-open': show }">
        <div class="modal-box max-w-lg bg-base-100 rounded-2xl p-0 overflow-hidden flex flex-col">
            <div class="px-5 py-4 border-b border-base-200 flex items-center justify-between">
                <div class="flex items-center gap-2 font-semibold">
                    <FolderOpenIcon class="w-5 h-5 text-primary" />
                    {{ t('workspaceBinding.rebindTitle') }}
                </div>
                <button class="btn btn-ghost btn-sm btn-circle" @click="emit('close')"><XMarkIcon class="w-4 h-4" /></button>
            </div>

            <div class="p-5 space-y-4 overflow-y-auto">
                <p class="text-xs text-base-content/60">{{ t('workspaceBinding.rebindNote') }}</p>

                <WorkspacePathField v-model="path" :agent-id="agentId" @validated="onValidated" />
            </div>

            <div class="px-5 py-4 border-t border-base-200 flex justify-end gap-2">
                <button class="btn btn-ghost btn-sm" @click="emit('close')">{{ t('common.cancel') }}</button>
                <button class="btn btn-primary btn-sm" :disabled="isBusy || !lastResult"
                    @click="doRebind">{{ t('workspaceBinding.rebindAction') }}</button>
            </div>
        </div>
    </div>
</template>
