# 设置控制台编码为 UTF-8 以支持 emoji
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 获取项目根目录 (脚本所在位置的父级)
$projectRoot = Split-Path -Parent $PSScriptRoot

# 0. 从 .env 加载环境变量
$envFile = "$projectRoot\.env"
if (Test-Path $envFile) {
    Write-Host "正在加载 .env 文件..."
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)\s*=\s*(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

# 检查 MSVC C++ 构建工具 (link.exe / cl.exe)，缺失会导致 Tauri 链接失败
Write-Host "`n🔧 检查 MSVC C++ 构建工具..."
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msvcReady = $false
if (Test-Path $vswhere) {
    $vcInstallPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vcInstallPath) { $msvcReady = $true }
}

if (-not $msvcReady) {
    Write-Host "`n❌ 未检测到 MSVC C++ 构建工具 (缺少 link.exe / cl.exe / Windows SDK)！" -ForegroundColor Red
    Write-Host "   Tauri 在 Windows 上使用 MSVC 工具链，必须安装 Visual Studio 的 'C++ 桌面开发' 工作负载。" -ForegroundColor Yellow
    Write-Host "`n   修复方法：以【管理员身份】打开 PowerShell，运行以下命令：" -ForegroundColor Cyan
    Write-Host '   winget install --id Microsoft.VisualStudio.BuildTools --override "--passive --norestart --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"' -ForegroundColor White
    Write-Host "`n   安装约 2-3GB (5-20 分钟)，完成后【新开终端】重新运行本脚本。" -ForegroundColor Yellow
    Pause
    exit
}
Write-Host "   ✅ 已检测到 MSVC C++ 构建工具。" -ForegroundColor Green

# 1. 确保依赖最新
Write-Host "`n📦 检查依赖..."
npm install

# 2. 构建 Windows 版本 (MSI / EXE)
Write-Host "`n🚀 正在构建 Windows 版本..."
cd $projectRoot

# Tauri v2 签名配置会自动读取 TAURI_SIGNING_PRIVATE_KEY 环境变量
# 如果 .env 中配置了，这里会自动生效。

# 注意：Windows 构建不需要 MSYS2，使用系统默认工具链 (MSVC)
# 本脚本产出"无内置服务端"的纯客户端：内置服务端的 resources 只在
# tauri.bundled.conf.json / tauri.server.conf.json overlay 中，
# 基础配置不含 resources，因此 package-desktop.ps1 的装配残留不会被打进包
npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 构建失败！" -ForegroundColor Red
    Pause
    exit
}

# 3. 收集构建产物
$distDir = "$projectRoot\dist-windows"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
New-Item -ItemType Directory -Path $distDir | Out-Null

Write-Host "`n📦 正在收集构建产物..."

# 3.1 复制安装包 (NSIS/EXE)
$nsisDir = "$projectRoot\src-tauri\target\release\bundle\nsis"
if (Test-Path $nsisDir) {
    Get-ChildItem $nsisDir -Filter "*.exe" | ForEach-Object {
        Copy-Item $_.FullName -Destination $distDir
        Write-Host "   [安装包] $($_.Name)"
    }
}

# 3.2 复制 MSI
$msiDir = "$projectRoot\src-tauri\target\release\bundle\msi"
if (Test-Path $msiDir) {
    Get-ChildItem $msiDir -Filter "*.msi" | ForEach-Object {
        Copy-Item $_.FullName -Destination $distDir
        Write-Host "   [MSI] $($_.Name)"
    }
}

# 3.3 复制便携版 (绿色版/文件夹格式)
$exeSource = "$projectRoot\src-tauri\target\release\seedclaw.exe"
if (Test-Path $exeSource) {
    $portableDir = "$distDir\seedclaw-portable"
    New-Item -ItemType Directory -Path $portableDir | Out-Null
    
    # 复制主程序
    Copy-Item $exeSource "$portableDir\seedclaw.exe"
    
    # 如果有外部依赖 DLL (如 OpenSSL/WebView2Loader)，通常也在同级目录，一并复制
    # 这里简单起见，复制同级所有 .dll 和 .json 资源 (如果有)
    Get-ChildItem "$projectRoot\src-tauri\target\release" -Filter "*.dll" | Copy-Item -Destination $portableDir
    Get-ChildItem "$projectRoot\src-tauri\target\release" -Filter "resources" | Copy-Item -Destination $portableDir -Recurse
    
    Write-Host "   [便携版] $portableDir"
    
    # 4. 部署到指定目录 (D:\Applications\seedclaw)
    $deployDir = "D:\Applications\seedclaw"
    if (-not (Test-Path $deployDir)) {
        New-Item -ItemType Directory -Path $deployDir -Force | Out-Null
    }
    
    Write-Host "`n🚀 正在部署到: $deployDir ..."
    # 复制便携版的所有内容到部署目录
    Copy-Item "$portableDir\*" -Destination $deployDir -Recurse -Force
    Write-Host "✅ 部署成功！" -ForegroundColor Green
    
} else {
    Write-Host "   ⚠️  未找到主程序 exe，可能构建失败或路径不匹配。" -ForegroundColor Yellow
}

Write-Host "`n✅ 所有过程完成！产物目录: $distDir" -ForegroundColor Green
explorer $distDir

Pause
