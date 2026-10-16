$startupFolder = [Environment]::GetFolderPath("Startup")
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) { $scriptDir = $PSScriptRoot }
$vbsSource = Join-Path $scriptDir "start_lan_service.vbs"
$vbsDest = Join-Path $startupFolder "Start_Kogna_Scanner.vbs"
Copy-Item -Path $vbsSource -Destination $vbsDest -Force
Write-Host "Startup script successfully registered at: $vbsDest"

# Run the startup script once to ensure desktop link is created
& (Join-Path $scriptDir "start_lan_service.ps1")
