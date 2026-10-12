@echo off
title Update Kogna Coffee POS
cd /d "%~dp0"

echo =========================================================
echo        KOGNA COFFEE — ONE-CLICK POS UPDATER
echo =========================================================
echo.
echo [1/3] Checking internet connection and pulling latest code...
echo.

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed on this PC.
    echo Please install Git from https://git-scm.com/ to enable 1-click updates.
    pause
    exit /b 1
)

call git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Could not pull updates. Please check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/3] Updating database schema...
call npx prisma generate

echo.
echo [3/3] Rebuilding POS application...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application build failed.
    pause
    exit /b 1
)

echo.
echo =========================================================
echo  SUCCESS: Your offline POS has been updated to the latest version!
echo  Double-click start-pos.bat to run your updated POS.
echo =========================================================
echo.
pause
