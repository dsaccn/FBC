@echo off
setlocal
pushd "%~dp0.."
set "POS_DIR=%CD%"
popd
cd /d "%POS_DIR%"

if not exist "%POS_DIR%\logs" mkdir "%POS_DIR%\logs"

set "NEED_DL=0"
if not exist "%POS_DIR%\bin\cloudflared.exe" set "NEED_DL=1"
if exist "%POS_DIR%\bin\cloudflared.exe" (
    for %%F in ("%POS_DIR%\bin\cloudflared.exe") do (
        if %%~zF LSS 20000000 (
            del /f /q "%POS_DIR%\bin\cloudflared.exe" >nul 2>&1
            set "NEED_DL=1"
        )
    )
)

if "%NEED_DL%"=="1" (
    echo [%DATE% %TIME%] [INFO] Downloading cloudflared.exe... >> "%POS_DIR%\logs\tunnel.log"
    if not exist "%POS_DIR%\bin" mkdir "%POS_DIR%\bin"
    set "CF_DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    if "%PROCESSOR_ARCHITECTURE%"=="x86" (
        if not defined PROCESSOR_ARCHITEW6432 (
            set "CF_DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe"
        )
    )
    if exist "%POS_DIR%\bin\cloudflared.tmp" del /f /q "%POS_DIR%\bin\cloudflared.tmp" >nul 2>&1
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.DownloadFile('%CF_DL_URL%', '%POS_DIR%\bin\cloudflared.tmp')"
    if exist "%POS_DIR%\bin\cloudflared.tmp" (
        for %%F in ("%POS_DIR%\bin\cloudflared.tmp") do (
            if %%~zF GTR 20000000 (
                move /y "%POS_DIR%\bin\cloudflared.tmp" "%POS_DIR%\bin\cloudflared.exe" >nul
                echo [%DATE% %TIME%] [OK] Cloudflare binary downloaded successfully >> "%POS_DIR%\logs\tunnel.log"
            ) else (
                del /f /q "%POS_DIR%\bin\cloudflared.tmp" >nul 2>&1
                echo [%DATE% %TIME%] [ERROR] Cloudflare download incomplete >> "%POS_DIR%\logs\tunnel.log"
                exit /b 1
            )
        )
    )
)

if not exist "%POS_DIR%\bin\cloudflared.exe" (
    echo [%DATE% %TIME%] [ERROR] cloudflared.exe was not found in %POS_DIR%\bin\ >> "%POS_DIR%\logs\tunnel.log"
    exit /b 1
)

"%POS_DIR%\bin\cloudflared.exe" tunnel --url http://localhost:3000 --protocol http2 run --token eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9 --logfile "%POS_DIR%\logs\tunnel.log"
