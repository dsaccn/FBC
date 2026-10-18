@echo off
:: =========================================================
:: Kogna Coffee POS — Offline Installer
:: Run this ONCE on the offline PC (as Administrator).
:: Sets up auto-start, desktop shortcuts, firewall, and verifies components.
:: =========================================================

set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

:: Check if running directly inside a zip without extracting
echo "%POS_DIR%" | findstr /i "AppData\Local\Temp" >nul
if %errorlevel% equ 0 (
    echo.
    echo =========================================================
    echo [ERROR] YOU ARE RUNNING THIS FROM INSIDE THE ZIP ARCHIVE!
    echo =========================================================
    echo.
    echo You must EXTRACT the zip archive first before installing:
    echo   1. Close this window.
    echo   2. Right-click 'kogna-coffee-pos-offline.zip'.
    echo   3. Click 'Extract All...'.
    echo   4. Extract to a normal folder (e.g. C:\kogna-pos or Desktop).
    echo   5. Open that extracted folder and run install-offline.bat.
    echo.
    echo =========================================================
    pause
    exit /b 1
)

set "TASK_NAME=Kogna Coffee POS Server"
set "BAT_FILE=%POS_DIR%start-pos.bat"

:: Add default Node installation paths
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo.
echo =========================================================
echo       KOGNA COFFEE POS — OFFLINE INSTALLER
echo =========================================================
echo.

:: ── Step 0: Auto-Elevate to Administrator if not already elevated ───
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Administrator permissions required.
    echo Requesting Administrator elevation...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b 0
)

:: ── Step 1: Node.js check ────────────────────────────────
echo [1/5] Checking for Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%POS_DIR%node-v22.14.0-x64.msi" (
        echo Node.js not detected. Found installer in package: node-v22.14.0-x64.msi
        echo Installing Node.js now... Please wait a moment...
        msiexec /i "%POS_DIR%node-v22.14.0-x64.msi" /passive /norestart
        set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
        timeout /t 5 /nobreak >nul
    ) else (
        echo.
        echo [ERROR] Node.js is not installed on this computer.
        echo Please copy and run node-v22.14.0-x64.msi from your USB drive,
        echo then run install-offline.bat again.
        echo.
        pause
        exit /b 1
    )
)

where node >nul 2>&1
if %errorlevel% equ 0 (
    echo    Node.js found: OK
) else (
    echo [ERROR] Node.js installation finished, but command prompt cannot see it yet.
    echo Please restart your computer, then run install-offline.bat again.
    pause
    exit /b 1
)
echo.

:: ── Step 2: Verify Dependencies & Database ──────────────
echo [2/5] Verifying offline application files...
if exist "node_modules\" (
    echo    node_modules present: OK
) else (
    echo    [ERROR] node_modules folder is missing from this directory!
    echo    Make sure you extracted the FULL offline zip package.
    pause
    exit /b 1
)

if exist "prisma\kogna.db" (
    echo    Local database (kogna.db) present: OK
) else if exist "prisma\diva-addis.db" (
    echo    Local database (diva-addis.db) present: OK
) else (
    echo    [WARNING] prisma\kogna.db not found. A new database will be initialized.
)

:: Clear read-only flags & grant full permissions on database
attrib -r -s -h "prisma\*" /s /d >nul 2>&1
attrib -r -s -h "prisma\kogna.db*" >nul 2>&1
if exist "prisma\*.db-journal" del /f /q "prisma\*.db-journal" >nul 2>&1
icacls "%POS_DIR%prisma" /grant *S-1-1-0:(OI)(CI)F /T /C /Q >nul 2>&1
echo    Database write permissions: OK

:: Verify Prisma client
echo    Checking Prisma Client...
if not exist "node_modules\.prisma\client" (
    echo    Generating Prisma Client...
    call npx --no-install prisma generate
) else (
    echo    Prisma Client present: OK
)
echo.

:: ── Step 3: Check Production Build ───────────────────────
echo [3/5] Checking production build (.next)...
if exist ".next\" (
    echo    Pre-built production app (.next) found: OK
) else (
    echo    Pre-built bundle not found. Building locally (takes 2-3 mins)...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed.
        pause
        exit /b 1
    )
)
echo.

:: ── Step 4: Configure Windows Firewall ──────────────────
echo [4/5] Configuring Windows Firewall for waiter devices...
netsh advfirewall firewall delete rule name="Kogna Coffee POS Server (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="Kogna Coffee POS Server (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>&1
if %errorlevel% equ 0 (
    echo    Firewall port 3000 opened for waiter tablets and phones: OK
) else (
    echo    [INFO] Could not automatically add firewall rule. If waiter phones cannot connect, ensure port 3000 is allowed.
)
echo.

:: ── Step 5: Register Windows Auto-Start Task & Desktop Shortcuts ───
echo [5/5] Registering auto-start and creating Desktop shortcuts...

:: Clean up old task names if they exist
schtasks /delete /tn "DivaAddis POS Server" /f >nul 2>&1
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Configure Auto-Start on computer boot via Windows Startup folder (Silent)
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $startup=[Environment]::GetFolderPath('Startup'); $s=$ws.CreateShortcut(\"$startup\Kogna-POS.lnk\"); $s.TargetPath='%POS_DIR%start-silent.vbs'; $s.WorkingDirectory='%POS_DIR%'; $s.Save()" >nul 2>&1
echo    Auto-start on boot (Silent): OK

:: Create Desktop Shortcuts
set "DESKTOP=%USERPROFILE%\Desktop"
if exist "%DESKTOP%" (
    echo [InternetShortcut] > "%DESKTOP%\Open Kogna POS.url"
    echo URL=http://localhost:3000 >> "%DESKTOP%\Open Kogna POS.url"
    echo    Desktop shortcut 'Open Kogna POS' created: OK

    powershell -NoProfile -ExecutionPolicy Bypass -File "%POS_DIR%scripts\create_silent_print_shortcut.ps1" >nul 2>&1
    echo    Desktop shortcut 'Kogna POS (Silent Print)' created: OK

    echo [InternetShortcut] > "%DESKTOP%\Kogna Mobile Scanner.url"
    echo URL=https://scanner.kogna.coffee/scanner >> "%DESKTOP%\Kogna Mobile Scanner.url"
    echo    Desktop shortcut 'Kogna Mobile Scanner' created: OK

    powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $d='%DESKTOP%'; $s=$ws.CreateShortcut(\"$d\Start Kogna POS (Silent).lnk\"); $s.TargetPath='%POS_DIR%start-silent.vbs'; $s.WorkingDirectory='%POS_DIR%'; $s.Save()" >nul 2>&1
    echo    Desktop shortcut 'Start Kogna POS (Silent)' created: OK

    powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $d='%DESKTOP%'; $s=$ws.CreateShortcut(\"$d\Stop Kogna POS.lnk\"); $s.TargetPath='%POS_DIR%stop-pos.bat'; $s.WorkingDirectory='%POS_DIR%'; $s.Save()" >nul 2>&1
    echo    Desktop shortcut 'Stop Kogna POS' created: OK

    (
        echo ============================================================
        echo KOGNA COFFEE - MOBILE QR SCANNER
        echo ============================================================
        echo.
        echo Open this link on any iPhone or Android phone to scan QR codes:
        echo.
        echo   https://scanner.kogna.coffee/scanner
        echo.
        echo - Live camera auto-focus for Telebirr and CBE receipts
        echo - Instantly verifies payments on this PC
        echo - Works automatically whenever this PC is turned on
        echo.
        echo ============================================================
    ) > "%DESKTOP%\KOGNA_MOBILE_SCANNER_URL.txt"
    echo    Desktop instructions 'KOGNA_MOBILE_SCANNER_URL.txt' created: OK
)

:: Configure Cloudflare Mobile Scanner Windows Service if cloudflared is present
if exist "%POS_DIR%bin\cloudflared.exe" (
    echo.
    echo Configuring Cloudflare Tunnel Windows service for mobile scanner...
    "%POS_DIR%bin\cloudflared.exe" service install eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9 >nul 2>&1
    sc start cloudflared >nul 2>&1
    echo    Cloudflare Mobile Scanner Service: Installed ^& Started: OK
)
echo.

:: ── Done ────────────────────────────────────────────────
echo =========================================================
echo  Installation Complete!
echo =========================================================
echo.
echo  The Kogna Coffee POS is now installed on this computer.
echo  It will start automatically & silently whenever this computer boots up.
echo.
echo  To start the POS server:
echo    1. Double-click: 'Start Kogna POS (Silent)' on your Desktop
echo       (or start-silent.vbs)
echo    2. Double-click: 'Open Kogna POS' on Desktop (or open http://localhost:3000)
echo.
echo  To start with visible console logs instead:
echo    Double-click: start-pos.bat
echo.
echo  To stop the server:
echo    Double-click: 'Stop Kogna POS' on Desktop (or stop-pos.bat)
echo.
echo =========================================================
pause
