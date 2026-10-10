@echo off
title Kogna Coffee POS Server
cd /d "%~dp0"

echo =========================================================
echo             KOGNA COFFEE — POS SERVER
echo =========================================================
echo.
echo Location: %CD%
echo.

:: 1. Check if package.json is present in this directory
if not exist "package.json" (
    echo [ERROR] package.json was not found in this directory!
    echo Directory: %CD%
    echo.
    pause
    exit /b 1
)

:: 2. Ensure Node.js is accessible
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    if exist "node-v22.14.0-x64.msi" (
        echo Found installer node-v22.14.0-x64.msi in this folder.
        echo Please double-click node-v22.14.0-x64.msi to install it first!
    )
    echo.
    pause
    exit /b 1
)

:: 3. Open the browser to the POS
echo Opening http://localhost:3000 in your browser...
start http://localhost:3000

:: 4. Start Next.js production server
echo.
echo Starting POS server on port 3000...
echo (Keep this window open while using the POS!)
echo =========================================================
echo.

call npm start

echo.
echo =========================================================
echo The POS server has stopped.
echo =========================================================
pause
