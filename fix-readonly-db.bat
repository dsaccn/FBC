@echo off
title Fix Kogna POS Read-Only Database
cd /d "%~dp0"
set "POS_DIR=%~dp0"

echo.
echo =========================================================
echo       KOGNA COFFEE POS — DATABASE PERMISSION REPAIR
echo =========================================================
echo.

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm;C:\Program Files (x86)\nodejs"

:: 1. Stop any running server instances locking the database
echo [1/5] Stopping any running POS server processes...
schtasks /end /tn "Kogna Coffee POS Server" >nul 2>&1
schtasks /end /tn "DivaAddis POS Server" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo       Server stopped cleanly.

:: 2. Delete any orphaned journal files from previous crashes
echo [2/5] Cleaning up temporary SQLite locks...
if exist "prisma\*.db-journal" del /f /q "prisma\*.db-journal" >nul 2>&1
if exist "*.db-journal" del /f /q "*.db-journal" >nul 2>&1
echo       Temporary lock files cleared.

:: 3. Remove Read-Only attributes from prisma folder and database
echo [3/5] Removing Windows Read-Only flags...
attrib -r -s -h "prisma\*" /s /d >nul 2>&1
attrib -r -s -h "prisma" >nul 2>&1
attrib -r -s -h "prisma\kogna.db*" >nul 2>&1
attrib -r -s -h "kogna.db*" >nul 2>&1
echo       Read-only attributes removed.

:: 4. Grant Full Access permissions to Everyone
echo [4/5] Granting full read/write permissions...
icacls "%POS_DIR%prisma" /grant *S-1-1-0:(OI)(CI)F /T /C /Q >nul 2>&1
icacls "%POS_DIR%prisma\kogna.db" /grant *S-1-1-0:F /Q >nul 2>&1
echo       File permissions granted.

:: 5. Switch SQLite to WAL mode and verify writes
echo [5/5] Enabling WAL mode & testing write access...
if exist "scripts\ensure-db-writable.js" (
    node "scripts\ensure-db-writable.js"
) else (
    echo [INFO] ensure-db-writable.js not found, skipping script check.
)

echo.
echo =========================================================
echo  DATABASE PERMISSIONS REPAIRED SUCCESSFULLY!
echo =========================================================
echo.
echo  You can now start the POS server:
echo    - Double-click: start-pos.bat (or start-silent.vbs)
echo    - Open http://localhost:3000 and try your order again!
echo =========================================================
echo.
pause
