# Set console encoding to UTF-8 for emoji support
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Get project root directory (where this script is located)
$projectRoot = Split-Path -Parent $PSScriptRoot

# 1. Build Release APK (Unsigned)
Write-Host "`n🚀 Building Unsigned APK..."
cd $projectRoot
npx tauri android build --target aarch64

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Build Failed!" -ForegroundColor Red
    Pause
    exit
}

# 2. Locate Artifacts
$apkDir = "$projectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\release"
$unsignedApk = "$apkDir\app-universal-release-unsigned.apk"
$signedApk = "$apkDir\app-release-signed.apk"
$keystore = "$projectRoot\debug.keystore"

if (-not (Test-Path $unsignedApk)) {
    Write-Host "`n❌ APK file not found: $unsignedApk" -ForegroundColor Red
    Pause
    exit
}

# 3. Generate Keystore if missing
if (-not (Test-Path $keystore)) {
    Write-Host "`n🔑 Generating Debug Keystore..."
    keytool -genkey -v -keystore $keystore -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US,L=Unknown,ST=Unknown,C=US"
}

# 4. Sign APK
Write-Host "`n✍️ Signing APK..."
# Find apksigner using ANDROID_HOME
$apksigner = Get-ChildItem "$env:ANDROID_HOME\build-tools\*\apksigner.bat" | Sort-Object Name -Descending | Select-Object -First 1

if (-not $apksigner) {
    Write-Host "`n❌ apksigner not found in SDK!" -ForegroundColor Red
    Pause
    exit
}
Write-Host "Using apksigner: $($apksigner.FullName)"

& $apksigner.FullName sign --ks $keystore --ks-pass pass:android --key-pass pass:android --out $signedApk $unsignedApk

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ SUCCESS! Signed APK created:" -ForegroundColor Green
    Write-Host $signedApk
    explorer $apkDir
} else {
    Write-Host "`n❌ Signing Failed!" -ForegroundColor Red
}

Pause
