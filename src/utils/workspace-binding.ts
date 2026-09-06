import type { WorkspacePathError } from "../composables/useWorkspaceBinding";

/**
 * 工作区路径校验错误码 → i18n 键映射（workspaceBinding.* 键组，Task 2 落地）。
 * 独立成 utils 模块而非 .vue 内具名导出：<script setup> 不允许 ES 具名导出
 * （@vue/compiler-sfc 编译错误），且仓库测试从不 import .vue 模块。
 */
export function errorToI18nKey(e: WorkspacePathError | null): string | null {
    switch (e) {
        case "not_exists": return "workspaceBinding.errNotExists";
        case "not_dir": return "workspaceBinding.errNotDir";
        case "forbidden_data_dir": return "workspaceBinding.errForbidden";
        case "invalid": return "workspaceBinding.errInvalid";
        case "network": return "workspaceBinding.errNetwork";
        default: return null;
    }
}
