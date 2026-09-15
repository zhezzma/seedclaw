import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// TunnelPanel 是 .vue SFC，node:test 环境无法直接挂载；
// 沿用本仓库「源码契约测试」模式：对源码文本断言关键结构，
// 锁死「远程隧道与局域网 IP 同行切换、不再是底部独立展示」这一行为契约。
const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const read = (p: string) => readFileSync(path.join(repoRoot, p), 'utf8')
const panel = read('src/components/extensions/panels/TunnelPanel.vue')
const zh = read('src/i18n/zh.ts')
const en = read('src/i18n/en.ts')

test('远程视图状态机：默认局域网，远程项仅在隧道就绪时出现并可切换', () => {
    // 展示视图状态：'lan' | 'remote'，默认局域网直连
    assert.match(panel, /const selectedView = ref<'lan' | 'remote'>\('lan'\)/)

    // 切换行：多真实网卡「或」远程隧道就绪时展示（单 IP 且未连接则不占位）
    assert.match(panel, /v-if="state\.lanIps\.length > 1 \|\| remoteShareUrl"/)

    // 远程 pill 与局域网 IP pill 同一行：隧道就绪才渲染，点击切到远程视图
    const remotePill = panel.match(
        /<button v-if="remoteShareUrl"[^>]*>\s*\{\{ remoteHost \|\| t\('extensions\.tunnel\.remotePill'\) \}\}<\/button>/)
    assert.ok(remotePill, 'remote pill should render in the same row, gated by remoteShareUrl')
    assert.match(remotePill[0], /@click="selectedView = 'remote'"/)
    assert.match(remotePill[0], /selectedView === 'remote' \? 'btn-primary' : 'btn-outline'/)

    // 局域网 pill：点击切回局域网视图并选中该 IP（视图与 IP 双状态）
    assert.match(panel, /@click="selectLan\(ip\)"/)
    assert.match(panel, /function selectLan\(ip: string\) \{[\s\S]*?selectedView\.value = 'lan'[\s\S]*?selectedLanIp\.value = ip[\s\S]*?\}/)
})

test('二维码与链接随视图切换：远程视图展示隧道地址', () => {
    // 二维码渲染目标是「当前视图」的分享链接，不再是恒定的局域网地址
    assert.match(panel,
        /const shareUrl = computed\(\(\) =>\s*selectedView\.value === 'remote' \? remoteShareUrl\.value : lanShareUrl\.value\)/)
    assert.match(panel, /if \(shareUrl\.value === text\) qrDataUrl\.value = dataUrl/)
    assert.match(panel, /watch\(shareUrl,/)

    // 模板展示/复制的都是当前视图链接
    assert.match(panel, /\{\{ shareUrl \}\}/)
    assert.match(panel, /copyText\(shareUrl, 'tunnel-share-url'\)/)

    // 隧道断开时回落局域网视图，不得停留在远程视图显示空二维码
    assert.match(panel,
        /watch\(remoteShareUrl, \(url\) => \{\s*if \(!url\) selectedView\.value = 'lan'\s*\}\)/)
})

test('底部不再单独展示远程地址（并入上方切换行），i18n 同步清理', () => {
    // 旧「远程地址：+ 复制链接」独立区块已删除
    assert.doesNotMatch(panel, /remoteAddressLabel/)
    assert.doesNotMatch(panel, /tunnel-remote-url/)

    // i18n：新增远程 pill 兜底短标签，移除废弃 key，中英对齐
    assert.match(zh, /remotePill: '远程隧道'/)
    assert.match(en, /remotePill: 'Remote'/)
    assert.doesNotMatch(zh, /remoteAddressLabel/)
    assert.doesNotMatch(en, /remoteAddressLabel/)
})

test('顶部说明随视图切换；防火墙提示仅局域网视图展示', () => {
    assert.match(panel, /const headerKey = computed/)
    assert.match(panel, /\{\{ t\(headerKey\) \}\}/)
    assert.match(panel,
        /<p v-if="selectedView === 'lan'"[^>]*>\{\{ t\('extensions\.tunnel\.lanFirewallHint'\) \}\}<\/p>/)
})
