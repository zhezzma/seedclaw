import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// 源码结构断言（仓库惯例）：Vue 组件无法在 node:test 里 import，
// 用正则锁定关键契约——共享切换守卫、bundled 过滤、local 条目不可删除。
const root = path.resolve(import.meta.dirname, '..')
const switcherSource = readFileSync(path.join(root, 'src/components/GatewaySwitcher.vue'), 'utf8')
const settingsSource = readFileSync(path.join(root, 'src/views/SettingsView.vue'), 'utf8')
const localServerSource = readFileSync(path.join(root, 'src/composables/local-server.ts'), 'utf8')

test('switch guard is defined once in local-server and consumed by both entry points', () => {
    // 守卫逻辑（local 未就绪 / remote 未填地址）只许有一份真相：
    // local-server 导出 gatewaySwitchBlockReason，菜单与设置页都调它
    assert.match(
        localServerSource,
        /export function gatewaySwitchBlockReason\(/,
        'shared switch guard must be exported from local-server',
    )
    for (const [name, source] of [['GatewaySwitcher', switcherSource], ['SettingsView', settingsSource]] as const) {
        assert.match(
            source,
            /gatewaySwitchBlockReason\(entry\)/,
            `${name} must use the shared switch guard instead of a private copy`,
        )
        assert.match(
            source,
            /switchGateway\(entry\.id\)/,
            `${name} must route activation through switchGateway (reload + route rewrite)`,
        )
    }
})

test('sidebar account menu filters the managed local entry to bundled builds only', () => {
    // 非打包构建（Web/Android）账号菜单不得显示 local 条目
    assert.match(
        switcherSource,
        /localServer\.bundled \? \[\.\.\.local, \.\.\.remote\] : remote/,
        'menu entries must include the local entry only in bundled builds',
    )
    // 设置页列表同样按 bundled 过滤（reconcile 在纯 web 构建不跑，
    // 迁移来的 local 条目留着就是不可激活、不可删的幽灵行）
    assert.match(
        settingsSource,
        /configStore\.gateways\.filter\(\(g\) => g\.type === 'remote' \|\| localServer\.bundled\)/,
        'settings list must filter the local entry to bundled builds',
    )
})

test('local managed entry is never deletable from the settings list', () => {
    // local 条目由 bundled 托管保活，删除后无法恢复
    assert.match(
        settingsSource,
        /<button v-if="entry\.type === 'remote'" type="button" class="btn btn-ghost btn-xs shrink-0 text-error"/,
        'the delete button must be remote-only',
    )
})

test('removing the active gateway reloads the whole app when a replacement remains', () => {
    // 删激活条目仅改 store 不 reload 会让会话列表/SSE/WS 继续打向已删除服务器
    assert.match(
        settingsSource,
        /if \(wasActive && active\) \{[\s\S]*?switchGateway\(active\.id\)/,
        'removing the active entry must route through switchGateway for a full rebind',
    )
})

test('empty URL is rejected with feedback on save & connect', () => {
    // 空地址保存不再静默返回：toast 提示且弹窗保持打开
    assert.match(
        settingsSource,
        /if \(!url\) \{[\s\S]*?toast\.warning\(t\('setup\.enterGatewayUrl'\)\)/,
        'empty URL must produce a warning instead of a silent no-op',
    )
})

test('sidebar add-server deep-links into the new-server draft', () => {
    // 「添加服务器」不能与「设置」同效：经 ?gateway=new 深链直接落入新增草稿态
    assert.match(
        switcherSource,
        /router\.push\(\{ path: '\/settings', query: \{ gateway: 'new' \} \}\)/,
        'add server must deep-link with gateway=new',
    )
    assert.match(
        settingsSource,
        /route\.query\.gateway !== 'new' && configStore\.activeGateway/,
        'settings must open the new-server draft when deep-linked',
    )
})
