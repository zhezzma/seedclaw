# Set console encoding to UTF-8 for emoji support
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Check dependencies
Write-Host "Checking Java version..."
java -version

# Get project root directory (where this script is located)
$projectRoot = Split-Path -Parent $PSScriptRoot

# Run Tauri Android build (Debug)
Write-Host "Building Debug APK..."
cd $projectRoot
npx tauri android build --debug

$apkDir = "$projectRoot\src-tauri\gen\android\app\build\outputs\apk\universal\debug"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Build Successful!" -ForegroundColor Green
    Write-Host "APK Location:"
    Write-Host "$apkDir\app-universal-debug.apk"
    
    # Open the folder
    explorer $apkDir
} else {
    Write-Host "`n❌ Build Failed!" -ForegroundColor Red
}

Pause