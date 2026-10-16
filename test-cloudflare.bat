@echo off
setlocal enabledelayedexpansion
title Cloudflare Tunnel Diagnoser & Starter
set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

echo.
echo =========================================================
echo       KOGNA COFFEE — CLOUDFLARE SCANNER TUNNEL TEST
echo =========================================================
echo.

:: 1. Check if bin\cloudflared.exe is present and valid
echo [1/3] Checking for bin\cloudflared.exe...

if exist "%POS_DIR%bin\cloudflared.exe" (
    for %%F in ("%POS_DIR%bin\cloudflared.exe") do set "CF_SIZE=%%~zF"
    if !CF_SIZE! LSS 20000000 (
        echo [WARNING] bin\cloudflared.exe is corrupted or incomplete (!CF_SIZE! bytes^).
        echo           Deleting damaged file...
        del /f /q "%POS_DIR%bin\cloudflared.exe" >nul 2>&1
    )
)

if not exist "%POS_DIR%bin\cloudflared.exe" (
    echo.
    echo [ERROR] bin\cloudflared.exe is missing or was corrupted.
    echo.
    echo How to fix:
    echo   Option A: Copy the working 'bin' folder from your main PC to this PC.
    echo   Option B: Press 'Y' below to automatically download a clean copy.
    echo.
    set /p "DL_CHOICE=Do you want to download cloudflared.exe automatically? (Y/N): "
    if /i "!DL_CHOICE!"=="Y" (
        if not exist "%POS_DIR%bin" mkdir "%POS_DIR%bin"
        echo.
        echo Detecting operating system architecture (32-bit vs 64-bit)...
        set "DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        if "%PROCESSOR_ARCHITECTURE%"=="x86" (
            if not defined PROCESSOR_ARCHITEW6432 (
                echo Detected 32-bit Windows system.
                set "DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe"
            )
        )

        echo Downloading official cloudflared binary...
        echo URL: !DL_URL!
        echo Please wait (this is ~50 MB, may take 1-2 minutes)...

        if exist "%POS_DIR%bin\cloudflared.tmp" del /f /q "%POS_DIR%bin\cloudflared.tmp" >nul 2>&1
        powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.DownloadFile('!DL_URL!', '%POS_DIR%bin\cloudflared.tmp')"

        if exist "%POS_DIR%bin\cloudflared.tmp" (
            for %%F in ("%POS_DIR%bin\cloudflared.tmp") do set "DL_SIZE=%%~zF"
            if !DL_SIZE! GTR 20000000 (
                move /y "%POS_DIR%bin\cloudflared.tmp" "%POS_DIR%bin\cloudflared.exe" >nul
                echo [OK] cloudflared.exe downloaded and verified successfully! (!DL_SIZE! bytes)
            ) else (
                del /f /q "%POS_DIR%bin\cloudflared.tmp" >nul 2>&1
                echo [ERROR] Downloaded file is too small or incomplete (!DL_SIZE! bytes).
                echo Please copy the 'bin' folder directly from your main PC using a USB drive.
                echo.
                pause
                exit /b 1
            )
        ) else (
            echo [ERROR] Download failed. Check your internet connection.
            echo Please copy the 'bin' folder directly from your main PC.
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo Please copy the 'bin' folder from your main PC to: %POS_DIR%bin\
        pause
        exit /b 1
    )
) else (
    for %%F in ("%POS_DIR%bin\cloudflared.exe") do set "CF_SIZE=%%~zF"
    echo    bin\cloudflared.exe verified: OK (!CF_SIZE! bytes)
)
echo.

:: 2. Check if local POS server is running on port 3000
echo [2/3] Checking if local POS is running on port 3000...
netstat -aon | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel% neq 0 (
    echo    [INFO] Local POS server is NOT running on port 3000 yet.
    echo    The tunnel can still connect to Cloudflare, but phones
    echo    will show 502 until you start the POS server (start-pos.bat).
) else (
    echo    POS server listening on port 3000: OK
)
echo.

:: 3. Test Tunnel Connection live
echo [3/3] Starting Cloudflare Tunnel in live test mode...
echo.
echo Tunnel Token: dc5e9bb6-5592-4b83-9d13-b060a1fd2743
echo Target URL:   https://scanner.kogna.coffee/scanner
echo.
echo Connecting to Cloudflare network... (Press Ctrl+C to stop)
echo =========================================================
echo.

"%POS_DIR%bin\cloudflared.exe" tunnel --protocol http2 run --token eyJhIjoiM2UzNjljODU4YTllY2NhYTExNDkzZTIwNDhjODI0MmMiLCJ0IjoiZGM1ZTliYjYtNTU5Mi00YjgzLTlkMTMtYjA2MGExZmQyNzQzIiwicyI6Ik5tWmlNamMyWmpNdE5qVTBOQzAwWkRJNUxUZzBaVEl0T0dOak4ySTROemRpWlRrNSJ9

echo.
echo =========================================================
echo Cloudflare tunnel stopped.
echo =========================================================
pause
