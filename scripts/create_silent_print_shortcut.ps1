param(
    [string]$TargetUrl = "http://localhost:3000"
)

# Creates a Desktop shortcut that launches Chrome / Edge in Silent Kiosk Printing mode
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Kogna POS (Silent Print).lnk"

$candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) {
    $shortcut = $ws.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $browser
    $shortcut.Arguments = "--kiosk-printing --app=$TargetUrl"
    $shortcut.Description = "Kogna Coffee POS with Silent Printing (No print popup)"
    $shortcut.Save()
    Write-Host "[OK] Desktop shortcut created successfully!" -ForegroundColor Green
    Write-Host "     Path: $shortcutPath" -ForegroundColor White
    Write-Host "     Target: $browser --kiosk-printing --app=$TargetUrl" -ForegroundColor Cyan
} else {
    Write-Host "[ERROR] Neither Chrome nor Edge was found on this system." -ForegroundColor Red
}
