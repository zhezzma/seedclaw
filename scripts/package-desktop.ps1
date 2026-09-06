#Requires -Version 5.1
<#
桌面一键打包脚本（Windows，带内置 seedagent 服务端）

【名词说明】
"staging"（装配/备料）：指把内置服务端运行所需的全部文件，收集到
src-tauri\resources\seedagent\ 目录的过程。该目录会被 tauri 打进安装包/便携版，
桌面端运行时就是从它里面拉起服务端。装配内容包括：
    node.exe                  Node 运行时（本机版本匹配则直接拷贝，否则从 nodejs.org 下载）
    dist\                     seedagent 编译产物（npm run build 生成）
    node_modules\             生产依赖（在装配目录内单独 npm ci --omit=dev，不动 seedagent 仓库）
    package.json / package-lock.json

【完整流程】
  ① 构建 seedagent（在 $SeedagentDir 里 npm run build，每次强制重跑，保证 dist 最新）
  ② 采集 Node 运行时（本机版本匹配则拷贝，否则下载并缓存到 scripts\.cache\）
  ③ 装配（staging）：清空重建 src-tauri\resources\seedagent\，填入上述内容并校验
  ④ tauri build：前端 + Rust 打包，resources 随包携带
  ⑤ 收集产物：NSIS/MSI 安装包 → dist-windows\；便携版（裸 exe + resources）压成 zip
  ⑥ 部署：便携版内容镜像到 $DeployDir（先结束部署目录内运行中的 seedclaw/node 进程）

【用法】
  powershell -File scripts/package-desktop.ps1               # 全流程 ①→⑥（默认部署到 D:\Applications\seedclaw）
  powershell -File scripts/package-desktop.ps1 -StageOnly    # 只跑到 ③ 就停（只装配不打包），配合 npm run tauri dev 联调内置服务
  powershell -File scripts/package-desktop.ps1 -SkipStage    # 跳过 ①②③（复用已装配好的 resources），从 ④ 开始
  powershell -File scripts/package-desktop.ps1 -SkipDeploy   # 跑完 ①-⑤ 但不执行 ⑥

【参数】
  -SeedagentDir  seedagent 仓库路径（默认 D:\Workspace\seedagent，或环境变量 SEEDAGENT_DIR）
  -NodeVersion   Node 运行时版本（默认 23.11.0，须 23.x，原生模块 ABI 锁定）
  -DeployDir     部署目录（默认 D:\Applications\seedclaw）
  注意：-StageOnly 与 -SkipStage 互斥，不要同时传（同时传等于什么也不做直接退出）。
#>
param(
    [string]$SeedagentDir = $(if ($env:SEEDAGENT_DIR) { $env:SEEDAGENT_DIR } else { "D:\Workspace\seedagent" }),
    [string]$NodeVersion = "23.11.0",
    [string]$DeployDir = "D:\Applications\seedclaw",
    [switch]$StageOnly,
    [switch]$SkipStage,
    [switch]$SkipDeploy
)
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot | Split-Path
$staging = Join-Path $root 'src-tauri\resources\seedagent'
$cache = Join-Path $PSScriptRoot '.cache'

function Assert-Staging([string]$Dir) {
    foreach ($p in @('node.exe', 'dist\index.js', 'node_modules')) {
        if (-not (Test-Path (Join-Path $Dir $p))) { throw "staging incomplete at ${Dir}: missing $p" }
    }
}

# PS 5.1 的 Remove-Item/Copy-Item 对超过 260 字符的深路径（node_modules 常见）会失败。
# robocopy 内部走 \\?\ 长路径 API：用空目录 /MIR 清空目标，再删掉空壳。
function Remove-LongPath([string]$Dir) {
    if (-not (Test-Path $Dir)) { return }
    $emptyDir = Join-Path $env:TEMP ("seedclaw-empty-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $emptyDir | Out-Null
    robocopy $emptyDir $Dir /MIR /NFL /NDL /NJH /NJS | Out-Null
    Remove-Item -Recurse -Force $emptyDir
}

if ($SkipStage) {
    Write-Host "==> -SkipStage: reuse staging at $staging"
    Assert-Staging $staging
}
else {
    Write-Host "==> seedagent: $SeedagentDir"
    if (-not (Test-Path (Join-Path $SeedagentDir 'package.json'))) {
        throw "seedagent not found at $SeedagentDir (use -SeedagentDir or env SEEDAGENT_DIR)"
    }

    # ① 构建 seedagent（每次强制重跑，保证打进包的 dist 是最新的）
    Write-Host "==> building seedagent"
    Push-Location $SeedagentDir
    try {
        if (-not (Test-Path (Join-Path $SeedagentDir 'node_modules'))) { npm ci }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "seedagent build failed" }
    } finally { Pop-Location }

    # ② 采集 node.exe：本机版本匹配则直接拷，否则下载 pinned 版本
    function Get-LocalNodePath([string]$WantVersion) {
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCmd) { return $null }
        $v = (& node -v) 2>$null
        if ($v -eq "v$WantVersion") { return $nodeCmd.Source }
        return $null
    }
    $nodeExe = Get-LocalNodePath $NodeVersion
    if (-not $nodeExe) {
        $cached = Join-Path $cache "node-v$NodeVersion.exe"
        if (-not (Test-Path $cached)) {
            New-Item -ItemType Directory -Force -Path $cache | Out-Null
            $url = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"
            Write-Host "==> downloading $url"
            Invoke-WebRequest -Uri $url -OutFile $cached
        }
        $nodeExe = $cached
    }

    # ③ 装配（staging）：不在 seedagent 仓库里 prune，装配目录内独立 npm ci --omit=dev
    Write-Host "==> staging into $staging"
    Remove-LongPath $staging
    New-Item -ItemType Directory -Force -Path $staging | Out-Null

    Copy-Item (Join-Path $SeedagentDir 'dist') (Join-Path $staging 'dist') -Recurse
    Copy-Item (Join-Path $SeedagentDir 'package.json') (Join-Path $staging 'package.json')
    Copy-Item (Join-Path $SeedagentDir 'package-lock.json') (Join-Path $staging 'package-lock.json')
    Copy-Item $nodeExe (Join-Path $staging 'node.exe')

    Write-Host "==> npm ci --omit=dev (production node_modules in staging)"
    Push-Location $staging
    try {
        npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { throw "npm ci --omit=dev failed" }
    } finally { Pop-Location }

    # ③ 校验装配结果
    Assert-Staging $staging
    Write-Host "==> staging OK: $staging"
}

if ($StageOnly) {
    Write-Host "==> -StageOnly: done. Run 'npm run tauri dev' to test the bundled server."
    exit 0
}

# ④ tauri build（仅桌面）
Write-Host "==> npm run tauri build"
Push-Location $root
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} finally { Pop-Location }

# ⑤ 收集产物：NSIS/MSI + 便携版（裸 exe + resources 目录，resource_dir 按 exe 同目录解析）
$outDir = Join-Path $root 'dist-windows'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle'
Get-ChildItem "$bundleDir\nsis\*.exe", "$bundleDir\msi\*.msi" -ErrorAction SilentlyContinue |
    ForEach-Object { Copy-Item $_.FullName $outDir -Force; Write-Host "==> collected $($_.Name)" }

$portable = Join-Path $outDir 'portable'
Remove-LongPath $portable
New-Item -ItemType Directory -Force -Path $portable | Out-Null
Copy-Item (Join-Path $root 'src-tauri\target\release\seedclaw.exe') $portable
# Copy-Item -Recurse 同样受 260 字符限制，node_modules 用 robocopy 拷贝
robocopy (Join-Path $root 'src-tauri\resources') (Join-Path $portable 'resources') /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy resources failed (exit $LASTEXITCODE)" }

# Compress-Archive 对深路径同样会失败，用系统自带 bsdtar 生成 zip（绝对路径调用，避免 PATH 里 GNU tar 抢占）
$portableZip = Join-Path $outDir 'seedclaw-portable-windows.zip'
if (Test-Path $portableZip) { Remove-Item -Force $portableZip }
Push-Location $portable
try {
    & "$env:SystemRoot\System32\tar.exe" -a -c -f $portableZip seedclaw.exe resources
    if ($LASTEXITCODE -ne 0) { throw "portable zip failed (tar exit $LASTEXITCODE)" }
} finally { Pop-Location }
Write-Host "==> portable zip: dist-windows\seedclaw-portable-windows.zip"

# ⑥ 部署便携版到指定目录（参考 build_windows.ps1）
if (-not $SkipDeploy) {
    Write-Host "==> deploying to $DeployDir ..."

    # 先结束部署目录里运行中的进程（seedclaw.exe 及其拉起的 node.exe），
    # 否则 exe/node_modules 被锁，robocopy 覆盖会失败。只杀路径在部署目录内的，不动别处的 node。
    Get-Process -Name seedclaw, node -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and ($_.Path -like "$DeployDir*") } |
        ForEach-Object {
            Write-Host "    killing $($_.ProcessName) (pid $($_.Id))"
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    Start-Sleep -Milliseconds 800

    # /MIR 镜像同步：部署目录与便携版完全一致（清掉旧文件）；robocopy 走 \\?\ 长路径 API
    robocopy $portable $DeployDir /MIR /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "deploy robocopy failed (exit $LASTEXITCODE)" }
    Write-Host "==> deploy OK: $DeployDir"
}
Remove-LongPath $portable
Write-Host "==> done. Artifacts in $outDir"
