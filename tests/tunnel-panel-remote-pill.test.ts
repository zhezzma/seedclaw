import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// TunnelPanel 是 .vue SFC，node:test 环境无法直接挂载；
// 沿用本仓库「源码契约测试」模式：对源码文本断言关键结构，
// 锁死「远程隧道与局域网 IP 同行切换、远程相关区块仅远程模式渲染」这一行为契约。
const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '..')
const read = (p: string) => readFileSync(path.join(repoRoot, p), 'utf8')
const panel = read('src/components/extensions/panels/TunnelPanel.vue')
const zh = read('src/i18n/zh.ts')
const en = read('src/i18n/en.ts')

test('远程视图状态机：远程 pill 常驻，切换行即「局域网/远程」模式切换器', () => {
    // 展示视图状态：'lan' | 'remote'，默认局域网直连
    assert.match(panel, /const selectedView = ref<'lan' | 'remote'>\('lan'\)/)

    // 切换行无条件渲染：局域网 IP（≥1）+ 远程隧道，行本身即模式切换器
    //（旧版 v-if="state.lanIps.length > 1 || remoteShareUrl" 已删除——
    //  远程 pill 必须常驻，否则隧道断开后连接入口随之消失，无法重新连接）
    assert.match(panel, /<div class="flex flex-wrap justify-center gap-1\.5 mb-4">/)

    // 远程 pill：常驻渲染，展示远程主机名（未就绪回落短标签），点击切到远程视图
    const remotePill = panel.match(
        /<button class="btn btn-xs"\s*:class="selectedView === 'remote' \? 'btn-primary' : 'btn-outline'"\s*@click="selectedView = 'remote'">\s*\{\{ remoteHost \|\| t\('extensions\.tunnel\.remotePill'\) \}\}<\/button>/)
    assert.ok(remotePill, 'remote pill should render unconditionally in the switcher row')

    // 局域网 pill：点击切回局域网视图并选中该 IP（视图与 IP 双状态）
    assert.match(panel, /@click="selectLan\(ip\)"/)
    assert.match(panel, /function selectLan\(ip: string\) \{[\s\S]*?selectedView\.value = 'lan'[\s\S]*?selectedLanIp\.value = ip[\s\S]*?\}/)
})

test('二维码与链接随视图切换：未就绪不渲染空二维码', () => {
    // 二维码渲染目标是「当前视图」的分享链接，不再是恒定的局域网地址
    assert.match(panel,
        /const shareUrl = computed\(\(\) =>\s*selectedView\.value === 'remote' \? remoteShareUrl\.value : lanShareUrl\.value\)/)
    assert.match(panel, /if \(shareUrl\.value === text\) qrDataUrl\.value = dataUrl/)
    assert.match(panel, /watch\(shareUrl,/)

    // 二维码/链接/复制/提示整体随 shareUrl 显隐：远程未连接时不出现空白二维码框
    assert.match(panel, /<template v-if="shareUrl">/)

    // 模板展示/复制的都是当前视图链接
    assert.match(panel, /\{\{ shareUrl \}\}/)
    assert.match(panel, /copyText\(shareUrl, 'tunnel-share-url'\)/)

    // 隧道断开时回落局域网视图，不得停留在远程视图显示空二维码
    assert.match(panel,
        /watch\(remoteShareUrl, \(url\) => \{\s*if \(!url\) selectedView\.value = 'lan'\s*\}\)/)
})

test('App 区与远程隧道区仅远程模式渲染；模式互斥后分隔线删除', () => {
    // App 连接信息：仅远程视图展示（令牌缺失/无地址仍不渲染）
    assert.match(panel, /v-if="selectedView === 'remote' && appConnectUrl && !tokenMissing"/)

    // appConnectUrl 仅来自就绪隧道，不得回落局域网地址——
    // 远程未连接时 App 区整体隐藏，彼时展示局域网地址是误导（App 远程模式该填外网地址）
    const appUrlBlock = panel.match(/const appConnectUrl = computed\([\s\S]*?\n\}\)/)?.[0] ?? ''
    assert.ok(appUrlBlock, 'appConnectUrl computed should exist')
    assert.match(appUrlBlock, /status === 'ready'/)
    assert.doesNotMatch(appUrlBlock, /activeLanIp/)
    assert.doesNotMatch(appUrlBlock, /lanIps/) // 防止绕开 activeLanIp 直接用 lanIps[0] 重建兜底

    // 远程隧道状态/连接断开控制：仅远程视图渲染；
    // 令牌缺失或未检测到局域网网卡时保持可见（彼时无 pill 可切，不能把连接入口藏没了）
    assert.match(panel,
        /<template v-if="selectedView === 'remote' \|\| tokenMissing \|\| \(state && !state\.lanIps\?\.length\)">/)

    // 分隔线已删除：模式互斥后顶部说明已标明当前模式，无需再分隔；
    // App 区改为柔和底色卡片分组，同样不得回退为裸分隔线
    assert.doesNotMatch(panel, /<div class="divider/)
    assert.doesNotMatch(panel, /pt-3 border-t border-base-200/, 'App 区用底色卡片分组，不用裸分隔线')

    // 顶部说明随视图切换，不再依赖 remoteShareUrl（未连接的远程模式也要显示远程说明）
    assert.match(panel,
        /selectedView\.value === 'remote' \? 'extensions\.tunnel\.remoteTitle' : 'extensions\.tunnel\.lanReady'/)
})

test('底部不再单独展示远程地址（并入上方切换行），i18n 同步清理', () => {
    // 旧「远程地址：+ 复制链接」独立区块已删除
    assert.doesNotMatch(panel, /remoteAddressLabel/)
    assert.doesNotMatch(panel, /tunnel-remote-url/)

    // i18n：远程 pill 兜底短标签存在，废弃 key 已移除，中英对齐
    assert.match(zh, /remotePill: '远程隧道'/)
    assert.match(en, /remotePill: 'Remote'/)
    assert.doesNotMatch(zh, /remoteAddressLabel/)
    assert.doesNotMatch(en, /remoteAddressLabel/)
})

test('远程就绪视图去冗余：链接全文仅局域网渲染，状态行就绪时隐藏', () => {
    // 含 token 的完整链接（break-all 长串）仅局域网视图渲染：远程视图的等价信息
    // 已由二维码 + 复制链接 + App 区（裸地址/令牌）覆盖，长串纯属视觉噪音
    assert.match(panel, /<p v-if="selectedView === 'lan'" id="tunnel-share-url"/)

    // 状态行：远程视图就绪时隐藏（说明/二维码/App 区已自证就绪），
    // 连接中/断开中等过渡态（starting/stopping）始终显示
    const showStatusBlock = panel.match(/const showStatus = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] ?? ''
    assert.ok(showStatusBlock, 'showStatus computed should exist')
    assert.match(showStatusBlock, /starting\.value \|\| stopping\.value/)
    assert.match(showStatusBlock, /status === 'ready'/)
    assert.match(panel, /<p v-if="showStatus" class="text-sm text-base-content\/60 mb-4">/)
})
