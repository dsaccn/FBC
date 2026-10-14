$ErrorActionPreference = "SilentlyContinue"
$projectRoot = "c:\Users\dawit\OneDrive\Documents\managment\FBC"
Set-Location $projectRoot

# 1. Ensure logs directory exists
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$tunnelLog = Join-Path $logDir "tunnel.log"

# 2. Check if Next.js on port 3000 is running
$portTest = Test-NetConnection -ComputerName "localhost" -Port 3000 -WarningAction SilentlyContinue
if (-not $portTest.TcpTestSucceeded) {
  Write-Host "Starting Next.js server on port 3000..."
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $projectRoot -WindowStyle Hidden
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $check = Test-NetConnection -ComputerName "localhost" -Port 3000 -WarningAction SilentlyContinue
    if ($check.TcpTestSucceeded) { break }
  }
}

# 3. Check if cloudflared is running; if not, launch it
$cfProcess = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if (-not $cfProcess) {
  $cloudflaredExe = Join-Path $projectRoot "bin\cloudflared.exe"
  if (Test-Path $cloudflaredExe) {
    if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force }
    Start-Process -FilePath $cloudflaredExe -ArgumentList "tunnel --url http://localhost:3000 --http-host-header localhost:3000 --no-autoupdate --logfile `"$tunnelLog`"" -WorkingDirectory $projectRoot -WindowStyle Hidden
  }
}

# 4. Wait for the URL to be generated (up to 25s)
$tunnelUrl = ""
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $content = Get-Content $tunnelLog -Raw
    $match = [regex]::Match($content, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    if ($match.Success) {
      $tunnelUrl = $match.Value
      break
    }
  }
}

# 5. Save the URL to Desktop for easy access (both OneDrive Desktop and local Desktop)
$destFolders = @(
  [Environment]::GetFolderPath("Desktop"),
  "C:\Users\dawit\Desktop",
  "C:\Users\dawit\OneDrive\Desktop"
) | Select-Object -Unique

if ($tunnelUrl) {
  $scannerUrl = "$tunnelUrl/scanner"

  foreach ($folder in $destFolders) {
    if (Test-Path $folder) {
      # Save Windows Internet Shortcut
      $shortcutPath = Join-Path $folder "Kogna_Mobile_Scanner.url"
      "[InternetShortcut]`nURL=$scannerUrl" | Set-Content -Path $shortcutPath -Encoding ASCII
      
      # Save text file with instructions
      $txtPath = Join-Path $folder "KOGNA_MOBILE_SCANNER_URL.txt"
      @"
============================================================
KOGNA COFFEE - MOBILE QR SCANNER
============================================================

Your secure scanner is live! Open this link on any iPhone or Android phone:

  $scannerUrl

Features:
- Live Mobile Camera with Auto-Focus (Secure HTTPS)
- Fast Local Ethiopian IP Verification for Telebirr & CBE
- Runs directly from your local PC whenever turned on

(This file and the desktop shortcut update automatically on PC boot)
============================================================
"@ | Set-Content -Path $txtPath -Encoding UTF8
    }
  }

  Write-Host "Successfully generated Desktop links: $scannerUrl"
} else {
  Write-Host "Warning: Could not extract tunnel URL from $tunnelLog yet."
}
