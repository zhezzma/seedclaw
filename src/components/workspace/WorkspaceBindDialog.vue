<script setup lang="ts">
/**
 * 工作区绑定两段式弹窗（spec §5.2）。
 * - 未传 agentId：两段式 —— input 阶段校验路径（WorkspacePathField）；
 *   已绑定其他智能体 → 「切换到该智能体」（取第一个为默认目标，MVP）；
 *   未绑定 → 「下一步」进 create 阶段（id/name 按 basename 预填，脏检查防覆盖）
 *   → createAgent(FormData) → emit created。
 * - 传 agentId：rebind 模式，恒为 input 阶段，「更新绑定」→ updateAgent
 *   （PATCH workspaceDir，空串传 null 清除绑定）→ emit updated。
 * 注：阶段机/预填状态抽在 src/utils/bind-dialog-state.ts（useBindDialogState），
 * 其返回 reactive 包装对象，模板直接 st.form.id 访问；而 modelsState 是
 * 含 ref 的普通对象，模板对其属性不自动解包，需 modelsState.availableModels.value。
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { XMarkIcon, FolderOpenIcon } from "@heroicons/vue/24/outline";
import WorkspacePathField from "./WorkspacePathField.vue";
import { useBindDialogState } from "../../utils/bind-dialog-state";
import { useAgentsState } from "../../composables/useAgentsState";
import { useModelsState } from "../../composables/useModelsState";
import { useToast } from "../../composables/useToast";

const props = defineProps<{
    show: boolean;
    /** 传入 = rebind 模式（只改绑定）；缺省 = 绑定新项目（两段式） */
    agentId?: string;
    currentAgentName?: string;   // boundAgents 里是别的 agent 时的提示用（可选）
}>();
const emit = defineEmits<{
    (e: "close"): void;
    /** 两段式里点了「切换到该智能体」 */
    (e: "switchAgent", agentId: string): void;
    /** rebind 模式 PATCH 成功 */
    (e: "updated", workspaceDir: string | null): void;
    /** 创建成功（进入会话由父组件决定导航） */
    (e: "created", agentId: string): void;
}>();

const { t } = useI18n();
const agentsState = useAgentsState();
const modelsState = useModelsState();
const toast = useToast();

const isRebind = computed(() => !!props.agentId);
const stage = ref<"input" | "create">("input");
const path = ref("");
const isBusy = ref(false);
const st = useBindDialogState();

watch(() => props.show, (v) => { if (v) { stage.value = "input"; path.value = ""; st.reset(); } });

// 模型下拉：option 值为 "provider/model"，拆回 defaultProvider/defaultModel（同 AgentFormModal）
const selectedModelValue = computed({
    get: () => st.form.defaultProvider && st.form.defaultModel
        ? `${st.form.defaultProvider}/${st.form.defaultModel}`
        : st.form.defaultModel,
    set: (val: string) => {
        if (!val) { st.form.defaultProvider = ""; st.form.defaultModel = ""; return; }
        if (val.includes("/")) {
            const [p, ...m] = val.split("/");
            st.form.defaultProvider = p;
            st.form.defaultModel = m.join("/");
        } else { st.form.defaultModel = val; }
    },
});

function doSwitch() {
    if (!st.switchTarget) return;
    emit("switchAgent", st.switchTarget.id);
    emit("close");
}

async function doCreate() {
    isBusy.value = true;
    try {
        const data = new FormData();
        data.append("id", st.form.id);
        if (st.form.name) data.append("name", st.form.name);
        if (st.form.description) data.append("description", st.form.description);
        if (st.form.defaultModel) data.append("defaultModel", st.form.defaultModel);
        if (st.form.defaultProvider) data.append("defaultProvider", st.form.defaultProvider);
        if (path.value.trim()) data.append("workspaceDir", path.value.trim());
        await agentsState.createAgent(data);
        emit("created", st.form.id);
        emit("close");
    } catch (e: any) {
        toast.error(e?.message || String(e));
    } finally { isBusy.value = false; }
}

async function doRebind() {
    isBusy.value = true;
    try {
        await agentsState.updateAgent({ agentId: props.agentId!, workspaceDir: path.value.trim() || null });
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
                    {{ isRebind ? t('workspaceBinding.rebindTitle') : t('workspaceBinding.createTitle') }}
                </div>
                <button class="btn btn-ghost btn-sm btn-circle" @click="emit('close')"><XMarkIcon class="w-4 h-4" /></button>
            </div>

            <div class="p-5 space-y-4 overflow-y-auto">
                <p v-if="!isRebind && stage === 'input'" class="text-xs text-base-content/60">
                    {{ t('workspaceBinding.createDesc') }}
                </p>
                <p v-if="isRebind" class="text-xs text-base-content/60">{{ t('workspaceBinding.rebindNote') }}</p>

                <WorkspacePathField v-model="path" :agent-id="agentId" @validated="st.onValidated" />

                <!-- 阶段二：精简创建表单 -->
                <div v-if="!isRebind && stage === 'create'" class="space-y-3 pt-2 border-t border-base-200">
                    <div class="form-control">
                        <label class="label-text text-xs">{{ t('workspaceBinding.idLabel') }}</label>
                        <input v-model="st.form.id" class="input input-bordered input-sm w-full font-mono"
                            @input="st.markIdTouched()" />
                    </div>
                    <div class="form-control">
                        <label class="label-text text-xs">{{ t('workspaceBinding.nameLabel') }}</label>
                        <input v-model="st.form.name" class="input input-bordered input-sm w-full"
                            @input="st.markNameTouched()" />
                    </div>
                    <div class="form-control">
                        <label class="label-text text-xs">{{ t('workspaceBinding.modelLabel') }}</label>
                        <!-- 分组结构照抄 AgentFormModal：provider 分组 + provider/model 复合值 -->
                        <select v-model="selectedModelValue" class="select select-bordered select-sm w-full">
                            <option value="">{{ t('agent.form.modelPlaceholder') }}</option>
                            <optgroup v-for="group in modelsState.availableModels.value" :key="group.provider"
                                :label="group.provider">
                                <option v-for="model in group.models" :key="model.id"
                                    :value="`${group.provider}/${model.id}`">
                                    {{ model.name }}
                                </option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="form-control">
                        <label class="label-text text-xs">{{ t('workspaceBinding.descLabel') }}</label>
                        <input v-model="st.form.description" class="input input-bordered input-sm w-full" />
                    </div>
                </div>
            </div>

            <div class="px-5 py-4 border-t border-base-200 flex justify-end gap-2">
                <button class="btn btn-ghost btn-sm" @click="emit('close')">{{ t('common.cancel') }}</button>
                <!-- rebind：更新绑定 -->
                <button v-if="isRebind" class="btn btn-primary btn-sm" :disabled="isBusy || !st.lastResult"
                    @click="doRebind">{{ t('workspaceBinding.rebindAction') }}</button>
                <!-- input 阶段：已绑定→切换 -->
                <button v-if="stage === 'input' && st.switchTarget" class="btn btn-primary btn-sm"
                    @click="doSwitch">
                    {{ t('workspaceBinding.switchTo') }}
                </button>
                <button v-else-if="stage === 'input'" class="btn btn-primary btn-sm"
                    :disabled="!st.canNext" @click="stage = 'create'">
                    {{ t('workspaceBinding.next') }}
                </button>
                <!-- create 阶段 -->
                <button v-else class="btn btn-primary btn-sm" :disabled="isBusy || !st.form.id.trim()"
                    @click="doCreate">{{ t('workspaceBinding.createAndChat') }}</button>
            </div>
        </div>
    </div>
</template>
