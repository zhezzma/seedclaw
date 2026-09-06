import { computed, reactive, ref } from "vue";
import type { WorkspaceResolvePayload } from "../composables/useWorkspaceBinding";

/**
 * WorkspaceBindDialog 的阶段机与预填状态（spec §5.2，可直测组合式）。
 * - onValidated 由 WorkspacePathField 的 validated 事件驱动：记录校验结果，
 *   取第一个已绑定智能体为默认切换目标（多个时其余在字段提示中列出，MVP），
 *   并按脏检查预填 create 表单的 id/name。
 * - 预填脏检查：idTouched/nameTouched 初 false，字段 @input 置 true；
 *   仅未 touched 的字段跟随新 basename 更新（自动预填的值不算用户输入，
 *   校验路径变化时会被更新的 basename 覆盖；slug 为空串时不预填 id）。
 *   slug 对齐服务端 `/^[a-zA-Z0-9_-]+$/` 的 id 校验。
 * - 返回 reactive 包装对象：内嵌 ref 自动解包，组件模板与测试均可
 *   直接 `s.form.id` / `s.canNext` 访问（无需 .value）。
 */
export function useBindDialogState() {
    const form = ref({ id: "", name: "", description: "", defaultModel: "", defaultProvider: "" });
    const idTouched = ref(false);
    const nameTouched = ref(false);
    const switchTarget = ref<{ id: string; name: string } | null>(null);
    const lastResult = ref<WorkspaceResolvePayload | null>(null);

    const slugOf = (b: string) => b.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    const canNext = computed(() =>
        !!lastResult.value && !switchTarget.value && !!form.value.id.trim());

    function onValidated(payload: { basename: string; result: WorkspaceResolvePayload | null }) {
        lastResult.value = payload.result;
        switchTarget.value = payload.result?.boundAgents?.[0] ?? null;
        const b = payload.basename;
        if (!b) return;
        if (!idTouched.value) {
            const slug = slugOf(b);
            if (slug) form.value.id = slug;
        }
        if (!nameTouched.value) form.value.name = b;
    }
    function markIdTouched() { idTouched.value = true; }
    function markNameTouched() { nameTouched.value = true; }
    function reset() {
        form.value = { id: "", name: "", description: "", defaultModel: "", defaultProvider: "" };
        idTouched.value = false; nameTouched.value = false;
        switchTarget.value = null; lastResult.value = null;
    }
    return reactive({
        form, idTouched, nameTouched, switchTarget, lastResult,
        slugOf, canNext, onValidated, markIdTouched, markNameTouched, reset,
    });
}
