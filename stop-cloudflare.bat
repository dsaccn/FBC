@echo off
title Stop Cloudflare Scanner Tunnel
cd /d "%~dp0"

echo =========================================================
echo       KOGNA COFFEE — STOP CLOUDFLARE SCANNER TUNNEL
echo =========================================================
echo.

taskkill /f /im cloudflared.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Cloudflare tunnel stopped successfully.
) else (
    echo [INFO] Cloudflare tunnel is not currently running.
)

echo.
echo =========================================================
echo Done. Press any key to close.
echo =========================================================
pause >nul
