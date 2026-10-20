@echo off
title Stop Cloudflare Scanner Tunnel
cd /d "%~dp0"

echo =========================================================
echo       KOGNA COFFEE — STOP CLOUDFLARE SCANNER TUNNEL
echo =========================================================
echo.

taskkill /f /im cloudflared.exe >nul 2>&1
sc stop cloudflared >nul 2>&1
sc config cloudflared start= disabled >nul 2>&1
echo [OK] Cloudflare tunnel stopped & service disabled successfully.

echo.
echo =========================================================
echo Done. Press any key to close.
echo =========================================================
pause >nul
