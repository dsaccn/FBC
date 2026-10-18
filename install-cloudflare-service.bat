@echo off
title Install Cloudflare Background Service
set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Administrator permissions required.
    echo Requesting Administrator elevation...
    powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b 0
)

echo.
echo =========================================================
echo   KOGNA POS — INSTALL CLOUDFLARE BACKGROUND SERVICE
echo =========================================================
echo.

if not exist "%POS_DIR%bin\cloudflared.exe" (
    echo [ERROR] bin\cloudflared.exe was not found in this directory!
    echo Please ensure the bin folder is present.
    echo.
    pause
    exit /b 1
)

echo [1/3] Cleaning up any previous Cloudflare services...
sc stop cloudflared >nul 2>&1
"%POS_DIR%bin\cloudflared.exe" service uninstall >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Registering Cloudflare as a permanent Windows Service...
"%POS_DIR%bin\cloudflared.exe" service install eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9
sc config cloudflared start= auto >nul 2>&1

echo [3/3] Starting Cloudflare background service...
sc start cloudflared >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
sc query cloudflared | findstr /i "STATE"
echo.
echo =========================================================
echo  SUCCESS: Cloudflare is now a permanent Windows Service!
echo =========================================================
echo  1. It runs 100%% SILENTLY in the background (no window).
echo  2. It starts AUTOMATICALLY whenever this PC turns on.
echo  3. Mobile phones can always access:
echo     https://scanner.kogna.coffee/scanner
echo =========================================================
echo.
pause
