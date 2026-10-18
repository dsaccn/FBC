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

bin\cloudflared.exe tunnel --url http://localhost:3000 --protocol http2 run --token eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9

echo.
pause
