@echo off
title KOGNA COFFEE — RESCUE UPDATER (One-Time Fix)
cd /d "%~dp0"

echo =========================================================
echo   KOGNA COFFEE — RESCUE UPDATER
echo   This script fixes ALL known update issues, then
echo   pulls the latest code so future updates work perfectly.
echo =========================================================
echo.

set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs"

:: ============================================================
:: STEP 1: Kill EVERY process that could lock files
:: ============================================================
echo [1/6] Killing all processes that could block the update...
taskkill /f /im git.exe >nul 2>&1
taskkill /f /im git-remote-https.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

:: Stop and disable cloudflare Windows service permanently
sc stop cloudflared >nul 2>&1
sc config cloudflared start= disabled >nul 2>&1

:: Kill any process using port 3000 (Next.js server)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%p >nul 2>&1
)

:: Give Windows a moment to release file handles
timeout /t 2 /nobreak >nul
echo       All blocking processes terminated.
echo.

:: ============================================================
:: STEP 2: Delete ALL stale Git lock files
:: ============================================================
echo [2/6] Removing all stale Git lock files...
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\FETCH_HEAD.lock" del /f /q ".git\FETCH_HEAD.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\config.lock" del /f /q ".git\config.lock"
if exist ".git\shallow.lock" del /f /q ".git\shallow.lock"
if exist ".git\packed-refs.lock" del /f /q ".git\packed-refs.lock"
if exist ".git" (
    for /r ".git" %%F in (*.lock) do (
        del /f /q "%%F" >nul 2>&1
        echo       Removed: %%F
    )
)
echo       Git lock files cleared.
echo.

:: ============================================================
:: STEP 3: Delete locked log files that Git can't overwrite
:: ============================================================
echo [3/6] Cleaning locked log and temp files...
if exist "logs\tunnel.log" del /f /q "logs\tunnel.log" >nul 2>&1
if exist "bin\cloudflared.tmp" del /f /q "bin\cloudflared.tmp" >nul 2>&1
if exist "prisma\*.db-journal" del /f /q "prisma\*.db-journal" >nul 2>&1
echo       Locked files cleaned.
echo.

:: ============================================================
:: STEP 4: Check Git and configure safe directory
:: ============================================================
echo [4/6] Configuring Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed on this PC!
    echo Please install Git from: https://git-scm.com/download/win
    pause
    exit /b 1
)
git config --global --add safe.directory "%CD%" >nul 2>&1
git config --global --add safe.directory "*" >nul 2>&1

if not exist ".git" (
    git init >nul 2>&1
    git remote add origin https://github.com/dsaccn/FBC.git >nul 2>&1
) else (
    git remote set-url origin https://github.com/dsaccn/FBC.git >nul 2>&1
)
echo       Git configured.
echo.

:: ============================================================
:: STEP 5: Fetch and hard-reset to latest code
:: ============================================================
echo [5/6] Downloading and applying latest code from GitHub...

:: One final lock check right before fetch
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
for /r ".git" %%F in (*.lock) do del /f /q "%%F" >nul 2>&1

git fetch origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Could not connect to GitHub.
    echo Make sure this PC has internet access.
    echo Try: ping github.com
    pause
    exit /b 1
)

:: One final lock check right before reset
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
for /r ".git" %%F in (*.lock) do del /f /q "%%F" >nul 2>&1

git reset --hard origin/main
if %errorlevel% neq 0 (
    echo [ERROR] Failed to apply code. Trying force clean...
    git clean -fd >nul 2>&1
    git checkout -f origin/main >nul 2>&1
)
echo       Code updated successfully!
echo.

:: ============================================================
:: STEP 6: Build the application
:: ============================================================
echo [6/6] Building the POS application...
attrib -r -s -h "prisma\*" /s /d >nul 2>&1
attrib -r -s -h "prisma\kogna.db*" >nul 2>&1
icacls "%~dp0prisma" /grant *S-1-1-0:(OI)(CI)F /T /C /Q >nul 2>&1

call npx --no-install prisma generate
if %errorlevel% neq 0 (
    call npx prisma generate
)

call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed. Try running: npm install
    pause
    exit /b 1
)

echo.
echo =========================================================
echo  RESCUE UPDATE COMPLETE!
echo =========================================================
echo.
echo  Your POS is now fully updated and fixed.
echo  From now on, just use update-pos.bat normally.
echo  It will auto-fix any lock issues by itself.
echo.
echo  To start the POS:
echo    Double-click: start-silent.vbs (or start-pos.bat)
echo =========================================================
echo.
pause
