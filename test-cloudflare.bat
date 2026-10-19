@echo off
title Cloudflare Tunnel Tester
cd /d "%~dp0"

echo =========================================================
echo       KOGNA COFFEE - CLOUDFLARE SCANNER TEST
echo =========================================================
echo.

set "NEED_DL=0"
if not exist "bin\cloudflared.exe" set "NEED_DL=1"
if exist "bin\cloudflared.exe" (
    for %%F in ("bin\cloudflared.exe") do (
        if %%~zF LSS 20000000 (
            echo Detected incomplete or corrupted cloudflared.exe.
            del /f /q "bin\cloudflared.exe" >nul 2>&1
            set "NEED_DL=1"
        )
    )
)

if "%NEED_DL%"=="1" (
    echo [INFO] cloudflared.exe not found.
    echo Downloading official Cloudflare binary...
    echo.
    if not exist "bin" mkdir "bin"
    set "CF_DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    if "%PROCESSOR_ARCHITECTURE%"=="x86" (
        if not defined PROCESSOR_ARCHITEW6432 (
            echo Detected 32-bit Windows system.
            set "CF_DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe"
        )
    )
    if exist "bin\cloudflared.tmp" del /f /q "bin\cloudflared.tmp" >nul 2>&1
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.DownloadFile('%CF_DL_URL%', 'bin\cloudflared.tmp')"
    if exist "bin\cloudflared.tmp" (
        for %%F in ("bin\cloudflared.tmp") do (
            if %%~zF GTR 20000000 (
                move /y "bin\cloudflared.tmp" "bin\cloudflared.exe" >nul
                echo Cloudflare binary successfully downloaded and verified!
                echo.
            ) else (
                del /f /q "bin\cloudflared.tmp" >nul 2>&1
                echo [ERROR] Download was incomplete. Please check your internet connection.
                pause
                exit /b 1
            )
        )
    ) else (
        echo [ERROR] Could not download cloudflared.exe.
        pause
        exit /b 1
    )
)

echo [OK] Found bin\cloudflared.exe
echo.
echo Starting Cloudflare Tunnel in test mode...
echo (If successful, it will say 'Registered tunnel connection')
echo.
echo =========================================================
echo.

bin\cloudflared.exe tunnel --url http://localhost:3000 --protocol http2 run --token eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9

echo.
echo =========================================================
echo Cloudflare tunnel stopped.
echo =========================================================
pause
