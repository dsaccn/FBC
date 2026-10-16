@echo off
title Install Kogna Cloudflare Tunnel Windows Service

net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running with Administrator privileges...
    echo.
    echo Installing Cloudflared Windows Service...
    "c:\Users\dawit\OneDrive\Documents\managment\FBC\bin\cloudflared.exe" service install eyJhIjoiM2UzNjljODU4YTllY2NhYTExNDkzZTIwNDhjODI0MmMiLCJ0IjoiZGM1ZTliYjYtNTU5Mi00YjgzLTlkMTMtYjA2MGExZmQyNzQzIiwicyI6Ik5tWmlNamMyWmpNdE5qVTBOQzAwWkRJNUxUZzBaVEl0T0dOak4ySTROemRpWlRrNSJ9
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
