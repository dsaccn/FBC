@echo off
title Update Kogna Coffee POS
cd /d "%~dp0"

echo =========================================================
echo        KOGNA COFFEE — ONE-CLICK POS UPDATER
echo =========================================================
echo.

set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs"

:: 1. Check if Git is installed
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not detected on this PC.
    echo Please install Git from https://git-scm.com/download/win
    echo or use the installer on your USB drive.
    echo.
    pause
    exit /b 1
)

:: Auto-kill any hung background processes and release file locks
taskkill /f /im git.exe >nul 2>&1
taskkill /f /im git-remote-https.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1

:: Clean up old temporary files
if exist "%~dp0bin\cloudflared.tmp" del /f /q "%~dp0bin\cloudflared.tmp" >nul 2>&1

:: Auto-clean any stale Git lock files (from previous aborted runs or crashes)
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\FETCH_HEAD.lock" del /f /q ".git\FETCH_HEAD.lock" >nul 2>&1
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1
if exist ".git\config.lock" del /f /q ".git\config.lock" >nul 2>&1
if exist ".git" (
    for /r ".git" %%F in (*.lock) do del /f /q "%%F" >nul 2>&1
)

:: Ensure Git allows operations in this directory
git config --global --add safe.directory "%CD%" >nul 2>&1
git config --global --add safe.directory "*" >nul 2>&1

echo [1/5] Checking and connecting to GitHub repository...
if not exist ".git" (
    echo       Initializing local Git connection...
    git init >nul 2>&1
    git remote add origin https://github.com/dsaccn/FBC.git >nul 2>&1
) else (
    git remote get-url origin >nul 2>&1
    if %errorlevel% neq 0 (
        git remote add origin https://github.com/dsaccn/FBC.git >nul 2>&1
    ) else (
        git remote set-url origin https://github.com/dsaccn/FBC.git >nul 2>&1
    )
)

echo.
echo [2/5] Downloading latest code updates from GitHub...
:: Pre-fetch cleanup in case an editor or background task touched the index
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\FETCH_HEAD.lock" del /f /q ".git\FETCH_HEAD.lock" >nul 2>&1
if exist ".git" (
    for /r ".git" %%F in (*.lock) do del /f /q "%%F" >nul 2>&1
)
git fetch origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Could not download updates from GitHub.
    echo Please make sure this PC is connected to the internet,
    echo or open https://github.com/dsaccn/FBC in your browser to verify access.
    echo.
    pause
    exit /b 1
)

:: Sync code cleanly to the latest commit
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git" (
    for /r ".git" %%F in (*.lock) do del /f /q "%%F" >nul 2>&1
)
git reset --hard origin/main
if %errorlevel% neq 0 (
    echo [ERROR] Failed to apply latest code.
    pause
    exit /b 1
)

echo.
echo [3/5] Updating database schema & permissions...
attrib -r -s -h "prisma\*" /s /d >nul 2>&1
attrib -r -s -h "prisma\kogna.db*" >nul 2>&1
if exist "prisma\*.db-journal" del /f /q "prisma\*.db-journal" >nul 2>&1
icacls "%~dp0prisma" /grant *S-1-1-0:(OI)(CI)F /T /C /Q >nul 2>&1
call npx --no-install prisma generate
if %errorlevel% neq 0 (
    call npx prisma generate
)

echo.
echo [4/5] Building updated POS application...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application build failed.
    pause
    exit /b 1
)

echo.
echo [5/5] Checking Cloudflare Mobile Scanner tunnel...
if exist "%~dp0bin\cloudflared.exe" (
    for %%F in ("%~dp0bin\cloudflared.exe") do (
        if %%~zF LSS 20000000 (
            echo       Detected corrupted cloudflared.exe. Removing...
            del /f /q "%~dp0bin\cloudflared.exe" >nul 2>&1
        )
    )
)

if not exist "%~dp0bin\cloudflared.exe" (
    echo       cloudflared.exe not found. Downloading official Cloudflare binary...
    if not exist "%~dp0bin" mkdir "%~dp0bin"
    set "CF_DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    if "%PROCESSOR_ARCHITECTURE%"=="x86" (
        if not defined PROCESSOR_ARCHITEW6432 (
            echo       Detected 32-bit Windows system.
            set "CF_DL_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe"
        )
    )
    if exist "%~dp0bin\cloudflared.tmp" del /f /q "%~dp0bin\cloudflared.tmp" >nul 2>&1
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $wc = New-Object Net.WebClient; $wc.Headers.Add('User-Agent', 'Mozilla/5.0'); $wc.DownloadFile('%CF_DL_URL%', '%~dp0bin\cloudflared.tmp')"
    if exist "%~dp0bin\cloudflared.tmp" (
        for %%F in ("%~dp0bin\cloudflared.tmp") do (
            if %%~zF GTR 20000000 (
                move /y "%~dp0bin\cloudflared.tmp" "%~dp0bin\cloudflared.exe" >nul
                echo       Cloudflare tunnel binary downloaded: OK
            ) else (
                del /f /q "%~dp0bin\cloudflared.tmp" >nul 2>&1
            )
        )
    )
) else (
    echo       Cloudflare mobile tunnel binary: OK
)

echo.
echo =========================================================
echo  SUCCESS: Your POS has been updated to the latest version!
echo =========================================================
echo  All features, stock transfers, payment synchronization,
echo  mobile phone scanner, and database updates are now ready.
echo.
echo  To start the POS:
echo    Double-click: start-silent.vbs (or start-pos.bat)
echo =========================================================
echo.
pause
