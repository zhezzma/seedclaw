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

# 配置信息
$keystore = "$projectRoot\release.keystore"
$alias = "seedclaw"

$keystorePass = $env:KEYSTORE_PASS
if ([string]::IsNullOrWhiteSpace($keystorePass)) { $keystorePass = "android" } 

$keyPass = $env:KEY_PASS
if ([string]::IsNullOrWhiteSpace($keyPass)) { $keyPass = "android" }

# 设置 Gradle 所需的环境变量 (供 build.gradle.kts 使用)
[Environment]::SetEnvironmentVariable("ANDROID_KEYSTORE_PATH", $keystore, "Process")
[Environment]::SetEnvironmentVariable("ANDROID_KEYSTORE_PASSWORD", $keystorePass, "Process")
[Environment]::SetEnvironmentVariable("ANDROID_KEY_ALIAS", $alias, "Process")
[Environment]::SetEnvironmentVariable("ANDROID_KEY_PASSWORD", $keyPass, "Process")

Write-Host "ANDROID_KEYSTORE_PATH: $env:ANDROID_KEYSTORE_PATH"


# 1. 构建 Release APK (此时可能已由 Gradle 签名，也可能未签名)
Write-Host "`n🚀 正在构建 Release APK..."
cd $projectRoot
npx tauri android build --target aarch64

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ 构建失败！" -ForegroundColor Red
    Pause
    exit
}

# 2. 定位构建产物
$apkDir = "$projectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\release"
$gradleSignedApk = "$apkDir\app-universal-release.apk"
$unsignedApk = "$apkDir\app-universal-release-unsigned.apk"
$signedApk = "$apkDir\app-release-signed.apk"

# 检查 Gradle 是否已经生成了已签名的 APK (通过环境变量注入)
if (Test-Path $gradleSignedApk) {
    Write-Host "`n✅ 发现 Gradle 已签名的 APK：$gradleSignedApk" -ForegroundColor Green
    Copy-Item $gradleSignedApk $signedApk -Force
    Write-Host "   已复制到：$signedApk"
    
    Write-Host "`n✅ 成功！已签名 APK 准备就绪 (跳过手动签名)。" -ForegroundColor Green
    explorer $apkDir
    # 【重点】如果已经有签名包了，直接退出！不再执行后续的手动签名步骤
    exit 
}

# 如果没找到签名包，检查是否有未签名包 (准备进行手动签名)
if (-not (Test-Path $unsignedApk)) {
    Write-Host "`n❌ 未找到 APK 文件 (已检查已签名和未签名版本)：" -ForegroundColor Red
    Write-Host "   已签名版本：   $gradleSignedApk"
    Write-Host "   未签名版本： $unsignedApk"
    Pause
    exit
}

# 3. 如果密钥库不存在则生成 (仅针对手动签名流程)
if (-not (Test-Path $keystore)) {
    Write-Host "`n🔑 正在生成密钥库..."
    keytool -genkey -v -keystore $keystore -storepass $keystorePass -alias $alias -keypass $keyPass -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=zhepama, OU=godgodgame, O=godgodgame, L=bengbu, ST=anhui, C=cn"
}

# 4. 手动签名 APK (仅当 Gradle 未签名时执行)
Write-Host "`n✍️ 正在手动签名 APK..."
# 使用 ANDROID_HOME 查找 apksigner

$apksigner = Get-ChildItem "$env:ANDROID_HOME\build-tools\*\apksigner.bat" | Sort-Object Name -Descending | Select-Object -First 1

if (-not $apksigner) {
    Write-Host "`n❌ 在 SDK 中未找到 apksigner！" -ForegroundColor Red
    Pause
    exit
}
Write-Host "使用 apksigner：$($apksigner.FullName)"

& $apksigner.FullName sign --ks $keystore --ks-pass pass:$keystorePass --key-pass pass:$keyPass --out $signedApk $unsignedApk

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 成功！已创建签名 APK：" -ForegroundColor Green
    Write-Host $signedApk
    explorer $apkDir
} else {
    Write-Host "`n❌ 手动签名失败！" -ForegroundColor Red
}

Pause
