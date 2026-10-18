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

bin\cloudflared.exe tunnel --url http://localhost:3000 --protocol http2 run --token eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9

echo.
echo =========================================================
echo Cloudflare tunnel stopped.
echo =========================================================
pause
