@echo off
:: =========================================================
:: Kogna Coffee POS — Stop Server
:: Use this script to stop the POS server cleanly.
:: =========================================================

echo.
echo ==========================================
echo  Kogna Coffee POS — Stopping Server
echo ==========================================
echo.

set "STOPPED=0"

:: 1. Stop Windows Task Scheduler task if running
schtasks /end /tn "Kogna Coffee POS Server" >nul 2>&1
schtasks /end /tn "DivaAddis POS Server" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Stopped background Windows Task "Kogna Coffee POS Server".
    set "STOPPED=1"
)

:: 2. Terminate any process listening on port 3000
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo [OK] Terminating process on port 3000 (PID: %%p)...
    taskkill /f /pid %%p >nul 2>&1
    set "STOPPED=1"
)

:: 3. Terminate Cloudflare mobile tunnel if running
sc stop cloudflared >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Stopped Cloudflare mobile tunnel (cloudflared.exe).
    set "STOPPED=1"
)

echo.
if "%STOPPED%"=="1" (
    echo ==========================================
    echo  POS Server stopped successfully.
    echo ==========================================
) else (
    echo No active POS server was found running on port 3000.
)
echo.
pause
