// node:test 风格（纯函数，无 mock/无 vue 响应性），纳入 `node --test` 回归基线。
// errorToI18nKey 按 Controller 裁定放在 src/utils/workspace-binding.ts（.vue 内具名导出不可行）。
import test from 'node:test'
import assert from 'node:assert/strict'

import { errorToI18nKey } from '../src/utils/workspace-binding.ts'

test('errorToI18nKey: 错误码映射到 i18n 键', () => {
    assert.equal(errorToI18nKey('not_exists'), 'workspaceBinding.errNotExists')
    assert.equal(errorToI18nKey('not_dir'), 'workspaceBinding.errNotDir')
    assert.equal(errorToI18nKey('forbidden_data_dir'), 'workspaceBinding.errForbidden')
    assert.equal(errorToI18nKey('invalid'), 'workspaceBinding.errInvalid')
    assert.equal(errorToI18nKey('network'), 'workspaceBinding.errNetwork')
    assert.equal(errorToI18nKey(null), null)
})
