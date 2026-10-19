@echo off
title Kogna POS - Cloudflare Scanner Tunnel
cd /d "%~dp0"

echo =========================================================
echo       KOGNA COFFEE - CLOUDFLARE SCANNER TUNNEL
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
    echo Downloading official Cloudflare tunnel binary...
    echo (This is a one-time download and will take a few seconds)
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
                echo [ERROR] Download was incomplete. Please check your internet connection and try again.
                pause
                exit /b 1
            )
        )
    ) else (
        echo [ERROR] Could not download cloudflared.exe. Please check your internet connection.
        pause
        exit /b 1
    )
)

netstat -ano | findstr LISTENING | findstr :3000 >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo =========================================================
    echo [ERROR] POS Server is NOT running on port 3000!
    echo =========================================================
    echo Running the Cloudflare scanner tunnel on a PC where the
    echo POS server is not running will cause mobile phones to
    echo display "HTTP ERROR 503".
    echo.
    echo - If this PC is a waiter/client PC:
    echo   Keep this tunnel running ONLY on the main POS server PC.
    echo.
    echo - If this PC is the main POS server:
    echo   Please start the POS server first using start-silent.vbs
    echo   or start-pos.bat, then run this tunnel!
    echo =========================================================
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
