# Packaging script for Kogna Coffee POS offline installer
$ErrorActionPreference = "Stop"
$rootDir = (Get-Location).Path
$distDir = Join-Path $rootDir "kogna-coffee-pos-dist"
$zipFile = Join-Path $rootDir "kogna-coffee-pos-offline.zip"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Building Offline Installer Bundle" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Clean existing temp directory
if (Test-Path $distDir) {
    Write-Host "[1/6] Cleaning up old temporary directory..." -ForegroundColor Yellow
    Remove-Item -Path $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir | Out-Null

# 2. Copy source code and configuration files
Write-Host "[2/6] Copying source code and configuration..." -ForegroundColor Green
New-Item -ItemType Directory -Path (Join-Path $distDir "public") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $distDir "src") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $distDir "prisma") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $distDir "scripts") | Out-Null

Copy-Item -Path "public\*" -Destination (Join-Path $distDir "public") -Recurse -Force
Copy-Item -Path "src\*" -Destination (Join-Path $distDir "src") -Recurse -Force
Copy-Item -Path "prisma\*" -Destination (Join-Path $distDir "prisma") -Recurse -Force
Copy-Item -Path "scripts\*" -Destination (Join-Path $distDir "scripts") -Recurse -Force

$filesToCopy = @(
    ".env",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "install-offline.bat",
    "install-online.bat",
    "setup-and-autostart.bat",
    "start-silent.vbs",
    "start-pos.bat",
    "stop-pos.bat",
    "update-pos.bat",
    "package-offline.bat",
    "fix-readonly-db.bat",
    "README.md"
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination $distDir -Force
    }
}

if (Test-Path "node-v22.14.0-x64.msi") {
    Write-Host "      Adding Node.js LTS installer..." -ForegroundColor Green
    Copy-Item -Path "node-v22.14.0-x64.msi" -Destination $distDir -Force
}

# 3. Copy node_modules (excluding cache)
Write-Host "[3/6] Copying node_modules (dependencies)..." -ForegroundColor Green
$destNodeModules = Join-Path $distDir "node_modules"
New-Item -ItemType Directory -Path $destNodeModules | Out-Null
& robocopy "node_modules" $destNodeModules /E /XD .cache /NFL /NDL /NJH /NJS | Out-Null

# 4. Copy production build .next (excluding cache)
Write-Host "[4/6] Copying pre-built production app (.next)..." -ForegroundColor Green
$destNext = Join-Path $distDir ".next"
New-Item -ItemType Directory -Path $destNext | Out-Null
& robocopy ".next" $destNext /E /XD cache /NFL /NDL /NJH /NJS | Out-Null

# 5. Compress into offline zip
Write-Host "[5/6] Compressing bundle into zip archive..." -ForegroundColor Green
if (Test-Path $zipFile) {
    Remove-Item -Path $zipFile -Force
}

& tar.exe -a -c -f $zipFile -C $distDir .

# 6. Clean up temporary directory
Write-Host "[6/6] Cleaning up temporary staging directory..." -ForegroundColor Yellow
Remove-Item -Path $distDir -Recurse -Force

$fileInfo = Get-Item $zipFile
$sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " SUCCESS: Fresh offline bundle created!" -ForegroundColor Green
Write-Host " File: $zipFile" -ForegroundColor White
Write-Host " Size: $sizeMB MB" -ForegroundColor White
Write-Host " Updated: $($fileInfo.LastWriteTime)" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
