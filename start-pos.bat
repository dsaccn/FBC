@echo off
:: =========================================================
:: Diva Addis / Kogna Coffee POS — Start Server
:: Can be run interactively by double-clicking, or
:: automatically on boot via Task Scheduler (--background).
:: =========================================================

set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

:: Ensure Node.js is in PATH even if recently installed
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

if "%1"=="--background" goto BACKGROUND_MODE

:: =========================================================
:: Interactive Mode (Double-clicked by user)
:: =========================================================
title Kogna Coffee POS Server

echo.
echo =========================================================
echo             KOGNA COFFEE — POS SERVER
echo =========================================================
echo.

:: 1. Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not detected on this computer.
    if exist "%POS_DIR%node-v22.14.0-x64.msi" (
        echo.
        echo Found Node.js installer: node-v22.14.0-x64.msi
        echo Please run node-v22.14.0-x64.msi to install Node.js first,
        echo then restart start-pos.bat!
    ) else (
        echo Please install Node.js (LTS version) from https://nodejs.org
    )
    echo.
    pause
    exit /b 1
)

:: 2. Detect Local IP Address for other devices
set "LOCAL_IP=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"IP-Adresse"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set "LOCAL_IP=%%b"
    )
)

echo  Local PC Browser:     http://localhost:3000
echo  Waiter Phones / Tabs: http://%LOCAL_IP%:3000
echo.
echo =========================================================
echo  Starting server on 0.0.0.0:3000...
echo  (Keep this window open while using the POS)
echo =========================================================
echo.

:: Launch browser in background after 3 seconds
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start Next.js production server
call npm run start -- -H 0.0.0.0 -p 3000

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server exited with an error. Check if port 3000 is already in use.
    echo You can run stop-pos.bat and then try starting again.
    pause
)
exit /b

:: =========================================================
:: Background Mode (Task Scheduler / System Startup)
:: =========================================================
:BACKGROUND_MODE
echo [%date% %time%] Starting Kogna Coffee POS background server... >> "%POS_DIR%pos-server.log"
call npm run start -- -H 0.0.0.0 -p 3000 >> "%POS_DIR%pos-server.log" 2>&1
