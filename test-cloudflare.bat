@echo off
title Cloudflare Tunnel Tester
cd /d "%~dp0"

echo =========================================================
echo       KOGNA COFFEE - CLOUDFLARE SCANNER TEST
echo =========================================================
echo.

:: 1. Check if bin\cloudflared.exe exists
if not exist "bin\cloudflared.exe" (
    echo [ERROR] bin\cloudflared.exe is NOT found in this folder!
    echo.
    echo Please copy the 'bin' folder from your first PC to this PC.
    echo.
    pause
    exit /b 1
)

echo [OK] Found bin\cloudflared.exe
echo.
echo Starting Cloudflare Tunnel in test mode...
echo ^(If successful, it will say 'Registered tunnel connection'^)
echo.
echo =========================================================
echo.

bin\cloudflared.exe tunnel --protocol http2 run --token eyJhIjoiM2UzNjljODU4YTllY2NhYTExNDkzZTIwNDhjODI0MmMiLCJ0IjoiZGM1ZTliYjYtNTU5Mi00YjgzLTlkMTMtYjA2MGExZmQyNzQzIiwicyI6Ik5tWmlNamMyWmpNdE5qVTBOQzAwWkRJNUxUZzBaVEl0T0dOak4ySTROemRpWlRrNSJ9

echo.
echo =========================================================
echo Cloudflare tunnel stopped.
echo =========================================================
pause
