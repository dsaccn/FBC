@echo off
:: ====================================================================
:: Kogna Coffee POS — One-Click Installer & Auto-Start Setup
:: Run as Administrator for firewall & service setup.
:: ====================================================================

set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo.
echo =========================================================
echo       KOGNA COFFEE POS — SETUP & AUTO-START
echo =========================================================
echo.

:: 1. Check Node.js
echo [1/4] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%POS_DIR%node-v22.14.0-x64.msi" (
        echo    Node.js not detected. Installing from package...
        start /wait msiexec /i "%POS_DIR%node-v22.14.0-x64.msi" /passive /norestart
        set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
    ) else (
        echo    [ERROR] Node.js is not installed. Please install node-v22.14.0-x64.msi first.
        pause
        exit /b 1
    )
)
echo    Node.js: OK
echo.

:: 2. Generate Prisma Database Client
echo [2/4] Linking local SQLite database...
call npx --no-install prisma generate
echo    Prisma Client: OK
echo.

:: 3. Configure Windows Firewall (Port 3000 for waiter devices)
echo [3/4] Opening Port 3000 in Windows Firewall...
netsh advfirewall firewall delete rule name="Kogna POS (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Kogna POS (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
if %errorlevel% equ 0 (
    echo    Firewall Port 3000: Allowed (waiter phones can connect)
) else (
    echo    [INFO] Could not add firewall rule (requires admin rights).
)
echo.

:: 4. Configure Auto-Start (Windows Startup Folder - Silent)
echo [4/4] Configuring Silent Auto-Start on computer boot...
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $startup=[Environment]::GetFolderPath('Startup'); $s=$ws.CreateShortcut(\"$startup\Kogna-POS.lnk\"); $s.TargetPath='%POS_DIR%start-silent.vbs'; $s.WorkingDirectory='%POS_DIR%'; $s.Save()" >nul 2>&1

:: Create Desktop shortcuts
set "DESKTOP=%USERPROFILE%\Desktop"
if exist "%DESKTOP%" (
    echo [InternetShortcut] > "%DESKTOP%\Open Kogna POS.url"
    echo URL=http://localhost:3000 >> "%DESKTOP%\Open Kogna POS.url"
    echo    Desktop shortcut 'Open Kogna POS' created.

    powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $d='%DESKTOP%'; $s=$ws.CreateShortcut(\"$d\Start Kogna POS (Silent).lnk\"); $s.TargetPath='%POS_DIR%start-silent.vbs'; $s.WorkingDirectory='%POS_DIR%'; $s.Save()" >nul 2>&1
    echo    Desktop shortcut 'Start Kogna POS (Silent)' created.

    powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $d='%DESKTOP%'; $s=$ws.CreateShortcut(\"$d\Stop Kogna POS.lnk\"); $s.TargetPath='%POS_DIR%stop-pos.bat'; $s.WorkingDirectory='%POS_DIR%'; $s.Save()" >nul 2>&1
    echo    Desktop shortcut 'Stop Kogna POS' created.
)

echo    Auto-Start on boot (Silent): Configured successfully!
echo.
echo =========================================================
echo  SETUP COMPLETE!
echo =========================================================
echo.
echo  The POS server will now start automatically & silently whenever this PC turns on.
echo.
echo  To start it right now:
echo    Double-click 'Start Kogna POS (Silent)' on your Desktop
echo    (or double-click: start-silent.vbs)
echo    Then open:    http://localhost:3000
echo.
echo  To view server logs in console instead:
echo    Double-click: start-pos.bat
echo =========================================================
pause
