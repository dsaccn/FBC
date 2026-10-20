@echo off
title Clear Stale Git Locks - Kogna Coffee POS
cd /d "%~dp0"

echo =========================================================
echo        KOGNA COFFEE — CLEAR STALE GIT LOCKS
echo =========================================================
echo.

echo [1/2] Terminating any frozen or background Git & tunnel processes...
taskkill /f /im git.exe >nul 2>&1
taskkill /f /im git-remote-https.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
echo       Process check complete.
echo.

echo [2/2] Searching and removing any stale lock files...
set "FOUND_LOCK=0"
if exist ".git\index.lock" (
    del /f /q ".git\index.lock" >nul 2>&1
    echo       Removed: .git\index.lock
    set "FOUND_LOCK=1"
)
if exist ".git\FETCH_HEAD.lock" (
    del /f /q ".git\FETCH_HEAD.lock" >nul 2>&1
    echo       Removed: .git\FETCH_HEAD.lock
    set "FOUND_LOCK=1"
)
if exist ".git\HEAD.lock" (
    del /f /q ".git\HEAD.lock" >nul 2>&1
    echo       Removed: .git\HEAD.lock
    set "FOUND_LOCK=1"
)
if exist ".git\config.lock" (
    del /f /q ".git\config.lock" >nul 2>&1
    echo       Removed: .git\config.lock
    set "FOUND_LOCK=1"
)
if exist ".git" (
    for /r ".git" %%F in (*.lock) do (
        del /f /q "%%F" >nul 2>&1
        echo       Removed: %%F
        set "FOUND_LOCK=1"
    )
)

if "%FOUND_LOCK%"=="0" (
    echo       No stale lock files were found. Repository is already clean.
)

echo.
echo =========================================================
echo  GIT REPOSITORY UNLOCKED & READY!
echo =========================================================
echo  You can now run:
echo    - update-pos.bat (to download the latest update)
echo    - start-pos.bat  (to run the application)
echo =========================================================
echo.
pause
