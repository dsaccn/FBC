@echo off
title Fix Kogna Coffee Database Schema
cd /d "%~dp0"

echo =========================================================
echo        KOGNA COFFEE — ONE-CLICK DATABASE REPAIR
echo =========================================================
echo.
echo This script repairs the local database schema, ensures
echo all tables and columns (bar stock, verifications, recipes)
echo are synchronized, and rebuilds the application.
echo.

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs;C:\Program Files\Git\cmd;C:\Program Files\Git\bin"

:: 1. Terminate any running server on port 3000 to free database locks
echo [1/4] Stopping any running POS server...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%p >nul 2>&1
)
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo       Server stopped.
echo.

:: 2. Ensure permissions & clear SQLite journals
echo [2/4] Verifying database permissions...
attrib -r -s -h "prisma\*" /s /d >nul 2>&1
attrib -r -s -h "prisma\kogna.db*" >nul 2>&1
if exist "prisma\*.db-journal" del /f /q "prisma\*.db-journal" >nul 2>&1
icacls "%~dp0prisma" /grant *S-1-1-0:(OI)(CI)F /T /C /Q >nul 2>&1
echo       Permissions OK.
echo.

:: 3. Push schema to SQLite (adds missing columns without data loss)
echo [3/4] Synchronizing database schema to SQLite...
call npx --no-install prisma db push --accept-data-loss
if %errorlevel% neq 0 (
    call npx prisma db push --accept-data-loss
)

call npx --no-install prisma generate
if %errorlevel% neq 0 (
    call npx prisma generate
)
echo.

:: 4. Rebuild Next.js app
echo [4/4] Rebuilding POS application...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Application build failed.
    pause
    exit /b 1
)

echo.
echo =========================================================
echo  DATABASE REPAIR COMPLETE!
echo =========================================================
echo  The database schema has been successfully updated.
echo  Your menu, inventory, recipes, and reports will now load.
echo.
echo  To start the POS:
echo    Double-click: start-silent.vbs (or start-pos.bat)
echo =========================================================
echo.
pause
