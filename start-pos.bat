@echo off
title Kogna Coffee POS Server
cd /d "%~dp0"

echo =========================================================
echo             KOGNA COFFEE — POS SERVER
echo =========================================================
echo.
echo Location: %CD%
echo.

:: 1. Check if package.json is present in this directory
if not exist "package.json" (
    echo [ERROR] package.json was not found in this directory!
    echo Directory: %CD%
    echo.
    pause
    exit /b 1
)

:: 2. Ensure Node.js and Git are accessible
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs;C:\Program Files\Git\cmd;C:\Program Files\Git\bin"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    if exist "node-v22.14.0-x64.msi" (
        echo Found installer node-v22.14.0-x64.msi in this folder.
        echo Please double-click node-v22.14.0-x64.msi to install it first!
    )
    echo.
    pause
    exit /b 1
)

:: Ensure database file permissions & clear stale locks
attrib -r -s -h "prisma\*" /s /d >nul 2>&1
attrib -r -s -h "prisma\kogna.db*" >nul 2>&1
if exist "prisma\*.db-journal" del /f /q "prisma\*.db-journal" >nul 2>&1
icacls "%~dp0prisma" /grant *S-1-1-0:(OI)(CI)F /T /C /Q >nul 2>&1

:: 3. Automatic Code Update Check (seamlessly pulls GitHub code edits if online)
where git >nul 2>&1
if %errorlevel% equ 0 (
    git fetch origin main --quiet >nul 2>&1
    if %errorlevel% equ 0 (
        for /f %%i in ('git rev-list HEAD..origin/main --count 2^>nul') do (
            if %%i gtr 0 (
                echo.
                echo =========================================================
                echo  [UPDATE DETECTED] %%i new code edit(s) found on GitHub!
                echo  Updating POS application automatically...
                echo =========================================================
                call git pull origin main --quiet
                call npx prisma generate
                call npm run build
                echo [OK] POS updated to latest code successfully!
                echo.
            )
        )
    )
)

:: 4. Open the browser to the POS
echo Opening http://localhost:3000 in your browser...
start http://localhost:3000

:: 4. Start Next.js production server
echo.
echo Starting POS server on port 3000...
echo (Keep this window open while using the POS!)
echo =========================================================
echo.

call npm start

echo.
echo =========================================================
echo The POS server has stopped.
echo =========================================================
pause
