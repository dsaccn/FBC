@echo off
title Cloudflare Tunnel Diagnoser & Starter
set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

echo.
echo =========================================================
echo       KOGNA COFFEE — CLOUDFLARE SCANNER TUNNEL TEST
echo =========================================================
echo.

:: 1. Check if bin\cloudflared.exe exists
echo [1/3] Checking for bin\cloudflared.exe...
if not exist "%POS_DIR%bin\cloudflared.exe" (
    echo.
    echo [ERROR] bin\cloudflared.exe was NOT found in this folder!
    echo.
    echo Why this happened:
    echo   If you copied the lightweight zip (kogna-coffee-pos-online-setup.zip),
    echo   cloudflared.exe was excluded because of file size.
    echo.
    echo How to fix:
    echo   Option A: Copy the 'bin' folder from your main PC to this PC.
    echo   Option B: Press 'D' below to auto-download cloudflared.exe now.
    echo.
    set /p "DL_CHOICE=Do you want to download cloudflared.exe automatically? (Y/N): "
    if /i "%DL_CHOICE%"=="Y" (
        if not exist "%POS_DIR%bin" mkdir "%POS_DIR%bin"
        echo.
        echo Downloading official cloudflared-windows-amd64.exe from Cloudflare...
        powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', '%POS_DIR%bin\cloudflared.exe')"
        if exist "%POS_DIR%bin\cloudflared.exe" (
            echo [OK] cloudflared.exe downloaded successfully!
        ) else (
            echo [ERROR] Automatic download failed. Please manually copy the 'bin' folder from your first PC.
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo Please copy the 'bin' folder to: %POS_DIR%bin\
        pause
        exit /b 1
    )
) else (
    echo    bin\cloudflared.exe found: OK
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
