// 本文件为 vitest 风格，仓库未安装 vitest 依赖，
// 按交接口径运行：`npx -y vitest run tests/workspace-bind-dialog-state.test.ts`。
// 但 `node --test`（回归基线）默认会发现 tests/*.test.ts，而 node 环境无法
// 解析 "vitest" 包（ERR_MODULE_NOT_FOUND 会让回归变红）。故做运行器自守卫
// （同 tests/workspace-binding-state.test.ts）：仅在 vitest 环境下加载 vitest
// 并注册用例；node --test 下注册一个说明性占位用例。
// 被测 useBindDialogState 为纯状态组合式（vue reactivity，无网络依赖），
// 不注册任何 mock，直接动态引入 ../src/utils/bind-dialog-state。
const inVitest = process.env.VITEST !== undefined;

if (inVitest) {
    const { describe, expect, it } = await import("vitest");
    const { useBindDialogState } = await import("../src/utils/bind-dialog-state");

    describe("useBindDialogState", () => {
        it("validated 回调按脏检查预填 id/name", () => {
            const s = useBindDialogState();
            s.onValidated({ basename: "seedclaw", result: null });
            expect(s.form.id).toBe("seedclaw");
            expect(s.form.name).toBe("seedclaw");
            // 手动改过后不再覆盖
            s.markIdTouched();
            s.onValidated({ basename: "other", result: null });
            expect(s.form.id).toBe("seedclaw");
            expect(s.form.name).toBe("other");
        });

        it("slug 清洗非法字符并对齐服务端 id 规则", () => {
            expect(useBindDialogState().slugOf("My Proj!")).toBe("My-Proj");
            expect(useBindDialogState().slugOf("。。。")).toBe("");
        });

        it("阶段机：无绑定→下一步进 create；有绑定→switch", () => {
            const s = useBindDialogState();
            s.onValidated({ basename: "a", result: { boundAgents: [] } as any });
            expect(s.canNext).toBe(true);
            s.onValidated({ basename: "a", result: { boundAgents: [{ id: "x", name: "X" }] } as any });
            expect(s.canNext).toBe(false);
            expect(s.switchTarget).toEqual({ id: "x", name: "X" });
        });
    });
} else {
    const { test } = await import("node:test");
    test("useBindDialogState 状态机（vitest 专用用例集）", () => {
        // 占位：用例需 vitest 运行器（vue reactivity 断言），见文件头说明。
        // 运行：npx -y vitest run tests/workspace-bind-dialog-state.test.ts
    });
}
