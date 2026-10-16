@echo off
title Kogna POS - Cloudflare Scanner Tunnel
cd /d "%~dp0"

echo =========================================================
echo       KOGNA COFFEE - CLOUDFLARE SCANNER TUNNEL
echo =========================================================
echo.

if not exist "bin\cloudflared.exe" (
    echo [ERROR] bin\cloudflared.exe was not found in this folder!
    echo Please copy the 'bin' folder from your main PC.
    echo.
    pause
    exit /b 1
)

echo Starting mobile scanner tunnel...
echo Phones can access: https://scanner.kogna.coffee/scanner
echo.
echo (Keep this window open while using the mobile scanner!)
echo =========================================================
echo.

bin\cloudflared.exe tunnel --protocol http2 run --token eyJhIjoiM2UzNjljODU4YTllY2NhYTExNDkzZTIwNDhjODI0MmMiLCJ0IjoiZGM1ZTliYjYtNTU5Mi00YjgzLTlkMTMtYjA2MGExZmQyNzQzIiwicyI6Ik5tWmlNamMyWmpNdE5qVTBOQzAwWkRJNUxUZzBaVEl0T0dOak4ySTROemRpWlRrNSJ9

echo.
pause
