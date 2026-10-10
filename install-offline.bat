@echo off
:: =========================================================
:: Kogna Coffee POS — Offline Installer
:: Run this ONCE on the offline PC (as Administrator).
:: Sets up auto-start, desktop shortcuts, firewall, and verifies components.
:: =========================================================

set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"
set "TASK_NAME=Kogna Coffee POS Server"
set "BAT_FILE=%POS_DIR%start-pos.bat"

:: Add default Node installation paths
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo.
echo =========================================================
echo       KOGNA COFFEE POS — OFFLINE INSTALLER
echo =========================================================
echo.

:: ── Step 0: Admin check ─────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Administrator permissions required.
    echo Please right-click install-offline.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
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

if exist "prisma\diva-addis.db" (
    echo    Local database (diva-addis.db) present: OK
) else (
    echo    [WARNING] prisma\diva-addis.db not found. A new database will be initialized.
)

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

schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "cmd.exe /c \"%BAT_FILE%\" --background" ^
  /sc ONSTART ^
  /delay 0000:30 ^
  /ru SYSTEM ^
  /rl HIGHEST ^
  /f >nul 2>&1

if %errorlevel% neq 0 (
    echo    [WARNING] Could not register automatic background startup task.
    echo    You can still start the server manually anytime using the Desktop shortcut.
) else (
    echo    Auto-start registered: OK (starts automatically on computer boot)
)

:: Create Desktop Shortcuts via PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$s1 = $ws.CreateShortcut(\"$desktop\Start Kogna POS.lnk\"); " ^
  "$s1.TargetPath = '%BAT_FILE%'; " ^
  "$s1.WorkingDirectory = '%POS_DIR%'; " ^
  "$s1.Description = 'Start Kogna Coffee POS Server'; " ^
  "$s1.Save(); " ^
  "$s2 = $ws.CreateShortcut(\"$desktop\Stop Kogna POS.lnk\"); " ^
  "$s2.TargetPath = '%POS_DIR%stop-pos.bat'; " ^
  "$s2.WorkingDirectory = '%POS_DIR%'; " ^
  "$s2.Description = 'Stop Kogna Coffee POS Server'; " ^
  "$s2.Save(); " ^
  "$s3 = $ws.CreateShortcut(\"$desktop\Open Kogna POS.url\"); " ^
  "$s3.TargetPath = 'http://localhost:3000'; " ^
  "$s3.Save();" >nul 2>&1

echo    Desktop shortcuts created (Start Kogna POS, Stop Kogna POS, Open Kogna POS): OK
echo.

:: ── Done ────────────────────────────────────────────────
echo =========================================================
echo  Installation Complete!
echo =========================================================
echo.
echo  The Kogna Coffee POS is now installed on this computer.
echo.
echo  To start the POS server right now:
echo    1. Double-click the desktop shortcut: 'Start Kogna POS'
echo    2. Open your browser: http://localhost:3000
echo.
echo  To stop the server:
echo    Double-click the desktop shortcut: 'Stop Kogna POS'
echo.
echo =========================================================
pause
