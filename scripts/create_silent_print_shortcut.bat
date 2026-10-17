<# :
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath '%~f0') -join [Environment]::NewLine)"
exit /b %errorlevel%
#>

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Yellow
Write-Host "    KOGNA POS - SILENT PRINT SHORTCUT SETUP (NO POPUPS)" -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "This tool creates a desktop shortcut that opens Kogna POS with"
Write-Host "SILENT PRINTING enabled (Chrome / Edge kiosk printing)."
Write-Host "Receipts will print directly to your printer with ZERO popup windows!"
Write-Host ""
Write-Host "-------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "Main POS Server LAN IP: 192.168.1.4" -ForegroundColor White
Write-Host ""
Write-Host "  - If running on the MAIN SERVER PC: press [ENTER] (http://localhost:3000)" -ForegroundColor Gray
Write-Host "  - If running on the OTHER CLIENT PC: type http://192.168.1.4:3000" -ForegroundColor Yellow
Write-Host "-------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

$defaultUrl = "http://localhost:3000"
$enteredUrl = Read-Host "Enter POS URL [$defaultUrl]"
if ([string]::IsNullOrWhiteSpace($enteredUrl)) {
    $targetUrl = $defaultUrl
} else {
    $targetUrl = $enteredUrl.Trim()
    if (-not $targetUrl.StartsWith("http://") -and -not $targetUrl.StartsWith("https://")) {
        $targetUrl = "http://" + $targetUrl
    }
}

Write-Host ""
Write-Host "[1/3] Target URL: $targetUrl" -ForegroundColor White
Write-Host "[2/3] Searching for Chrome or Microsoft Edge..." -ForegroundColor White

$candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
    Write-Host "[ERROR] Neither Google Chrome nor Microsoft Edge was found on this PC." -ForegroundColor Red
    Write-Host "Please install Google Chrome or Edge and run this tool again." -ForegroundColor Yellow
    Read-Host "Press [ENTER] to exit"
    exit 1
}

Write-Host "[OK] Found browser: $browser" -ForegroundColor Green
Write-Host "[3/3] Creating Desktop shortcuts..." -ForegroundColor White

$profileDir = Join-Path $env:LOCALAPPDATA "KognaPOS_Browser"
$shortcutArgs = "--kiosk-printing --user-data-dir=`"$profileDir`" --app=$targetUrl"

$ws = New-Object -ComObject WScript.Shell
$desktopFolders = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:USERPROFILE "Desktop"),
    (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
    (Join-Path $env:PUBLIC "Desktop")
) | Where-Object { Test-Path $_ } | Select-Object -Unique

$createdCount = 0
foreach ($dir in $desktopFolders) {
    try {
        $lnkPath = Join-Path $dir "Kogna POS (Silent Print).lnk"
        $sc = $ws.CreateShortcut($lnkPath)
        $sc.TargetPath = $browser
        $sc.Arguments = $shortcutArgs
        $sc.Description = "Kogna POS with Silent Printing (No print popups)"
        $sc.Save()
        Write-Host "  -> Created: $lnkPath" -ForegroundColor Green
        $createdCount++
    } catch {
        Write-Warning "Could not save shortcut to $dir"
    }
}

Write-Host ""
if ($createdCount -gt 0) {
    Write-Host "===================================================================" -ForegroundColor Green
    Write-Host " SUCCESS: Desktop shortcut created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host " Launch Kogna from the new desktop shortcut:" -ForegroundColor White
    Write-Host "   'Kogna POS (Silent Print)'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host " All receipts will print directly to your default printer" -ForegroundColor White
    Write-Host " with ZERO popup windows and NO confirmation clicks!" -ForegroundColor White
    Write-Host "===================================================================" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Could not create shortcut in any desktop directory." -ForegroundColor Red
}

Write-Host ""
Read-Host "Press [ENTER] to exit"
