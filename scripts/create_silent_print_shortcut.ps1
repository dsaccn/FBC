param(
    [string]$TargetUrl = "http://localhost:3000"
)

# Creates a Desktop shortcut that launches Chrome / Edge in Silent Kiosk Printing mode
$ws = New-Object -ComObject WScript.Shell

$candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) {
    $profileDir = Join-Path $env:LOCALAPPDATA "KognaPOS_Browser"
    $shortcutArgs = "--kiosk-printing --user-data-dir=`"$profileDir`" --app=$TargetUrl"

    $desktopFolders = @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path $env:USERPROFILE "Desktop"),
        (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
        (Join-Path $env:PUBLIC "Desktop")
    ) | Where-Object { Test-Path $_ } | Select-Object -Unique

    foreach ($dir in $desktopFolders) {
        try {
            $shortcutPath = Join-Path $dir "Kogna POS (Silent Print).lnk"
            $shortcut = $ws.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = $browser
            $shortcut.Arguments = $shortcutArgs
            $shortcut.Description = "Kogna Coffee POS with Silent Printing (No print popup)"
            $shortcut.Save()
            Write-Host "[OK] Desktop shortcut created: $shortcutPath" -ForegroundColor Green
        } catch {}
    }
    Write-Host "     Target: $browser $shortcutArgs" -ForegroundColor Cyan
} else {
    Write-Host "[ERROR] Neither Chrome nor Edge was found on this system." -ForegroundColor Red
}
