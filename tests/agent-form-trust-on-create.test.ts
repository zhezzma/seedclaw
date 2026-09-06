import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const modalSource = readFileSync(path.join(root, 'src/components/agents/AgentFormModal.vue'), 'utf8')
const zhSource = readFileSync(path.join(root, 'src/i18n/zh.ts'), 'utf8')
const enSource = readFileSync(path.join(root, 'src/i18n/en.ts'), 'utf8')

test('submit guard aligns with checkbox render condition (no stale workspaceTrust on hidden checkbox)', () => {
    // 防陈旧标志：勾选状态残留但勾选框已因 trustRequiring 复位而隐藏时，
    // 不得继续随创建请求提交 workspaceTrust=trust（守卫须与渲染条件同谓词）
    assert.match(
        modalSource,
        /props\.mode === 'add' && formData\.value\.workspaceDir && workspaceTrustRequiring\.value && workspaceTrustChecked\.value/,
        'submitForm guard must include workspaceTrustRequiring.value alongside workspaceTrustChecked.value'
    )
})

test('trust-on-create checkbox renders in add mode only', () => {
    // 编辑模式信任走 WorkspacePathField :agent-id 的信任区块，勾选框仅新建可见
    assert.match(
        modalSource,
        /v-if="mode === 'add' && formData\.workspaceDir && workspaceTrustRequiring"/
    )
})

test('trustOnCreate i18n key exists in zh and en', () => {
    assert.match(zhSource, /trustOnCreate: /)
    assert.match(enSource, /trustOnCreate: /)
})
