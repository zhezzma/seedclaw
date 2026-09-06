#Requires -Version 5.1
<#
桌面打包：构建 seedagent → 采集 Node 23 运行时 → staging 到 src-tauri/resources/seedagent → tauri build
用法：
  powershell -File scripts/package-desktop.ps1                      # 完整打包（staging + build + 收集）
  powershell -File scripts/package-desktop.ps1 -StageOnly           # 只 staging（供 tauri dev 联调内置服务）
  powershell -File scripts/package-desktop.ps1 -SkipStage           # 复用已有 staging，直接 build
  powershell -File scripts/package-desktop.ps1 -RebuildServer       # 强制重跑 seedagent 构建
#>
param(
    [string]$SeedagentDir = $(if ($env:SEEDAGENT_DIR) { $env:SEEDAGENT_DIR } else { "D:\Workspace\seedagent" }),
    [string]$NodeVersion = "23.11.0",
    [switch]$StageOnly,
    [switch]$SkipStage,
    [switch]$RebuildServer
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

    # 1. 构建 seedagent（dist 缺失或 -RebuildServer 时）
    $distIndex = Join-Path $SeedagentDir 'dist\index.js'
    if ($RebuildServer -or -not (Test-Path $distIndex)) {
        Write-Host "==> building seedagent"
        Push-Location $SeedagentDir
        try {
            if (-not (Test-Path (Join-Path $SeedagentDir 'node_modules'))) { npm ci }
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "seedagent build failed" }
        } finally { Pop-Location }
    } else {
        Write-Host "==> seedagent dist up-to-date (skip build; use -RebuildServer to force)"
    }

    # 2. 采集 node.exe：本机版本匹配则直接拷，否则下载 pinned 版本
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

    # 3. staging（不在 seedagent 仓库里 prune，staging 目录内独立 npm ci --omit=dev）
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

    # 4. 校验 staging
    Assert-Staging $staging
    Write-Host "==> staging OK: $staging"
}

if ($StageOnly) {
    Write-Host "==> -StageOnly: done. Run 'npm run tauri dev' to test the bundled server."
    exit 0
}

# 5. tauri build（仅桌面）
Write-Host "==> npm run tauri build"
Push-Location $root
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} finally { Pop-Location }

# 6. 收集产物：NSIS/MSI + 便携版（裸 exe + resources 目录，resource_dir 按 exe 同目录解析）
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
Remove-LongPath $portable
Write-Host "==> portable zip: dist-windows\seedclaw-portable-windows.zip"
Write-Host "==> done. Artifacts in $outDir"
