@echo off
title Install Kogna Cloudflare Tunnel Windows Service

net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with Administrator privileges...
    echo.
    pushd "%~dp0.."
    set "POS_DIR=%CD%"
    popd

    if not exist "%POS_DIR%\bin\cloudflared.exe" (
        echo [ERROR] cloudflared.exe not found at %POS_DIR%\bin\cloudflared.exe
        pause
        exit /b 1
    )

    echo Installing Cloudflared Windows Service...
    "%POS_DIR%\bin\cloudflared.exe" service install eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9
    echo.
    echo Starting Cloudflared service...
    sc start cloudflared
    echo.
    echo ============================================================
    echo [SUCCESS] Cloudflare Tunnel Service is now installed!
    echo It will automatically run on every PC restart in the background.
    echo ============================================================
    echo.
    pause
) else (
    echo Requesting Administrator permission...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
)
