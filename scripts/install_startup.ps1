$startupFolder = [Environment]::GetFolderPath("Startup")
$vbsSource = "c:\Users\dawit\OneDrive\Documents\managment\FBC\scripts\start_lan_service.vbs"
$vbsDest = Join-Path $startupFolder "Start_Kogna_Scanner.vbs"
Copy-Item -Path $vbsSource -Destination $vbsDest -Force
Write-Host "Startup script successfully registered at: $vbsDest"

# Run the startup script once to ensure desktop link is created
& "c:\Users\dawit\OneDrive\Documents\managment\FBC\scripts\start_lan_service.ps1"
