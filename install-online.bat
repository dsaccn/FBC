@echo off
:: =========================================================
:: Kogna Coffee POS — Setup Localhost (Internet-connected PC)
:: Run this script on the target PC to install dependencies
:: and build the local POS server.
:: =========================================================

set "POS_DIR=%~dp0"
cd /d "%POS_DIR%"

echo.
echo =========================================================
echo        KOGNA COFFEE — LOCALHOST INSTALLER
echo =========================================================
echo.

:: 1. Check for Node.js
echo [1/3] Checking for Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not installed on this computer.
    if exist "%POS_DIR%node-v22.14.0-x64.msi" (
        echo Found installer in folder! Running node-v22.14.0-x64.msi...
        start "" "%POS_DIR%node-v22.14.0-x64.msi"
        echo Please finish the Node.js installation wizard, then run install-online.bat again!
    ) else (
        echo Please download and install Node.js (LTS version) from:
        echo https://nodejs.org
    )
    echo.
    pause
    exit /b 1
)
echo    Node.js found: OK
echo.

:: 2. Install dependencies
echo [2/3] Installing dependencies (npm install)...
echo    (This may take 1-2 minutes)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed. Please check your internet connection.
    pause
    exit /b 1
)
echo    Dependencies installed: OK
echo.

:: 3. Generate Prisma client & build production Next.js bundle
echo [3/3] Generating database client and building application...
if exist "scripts\add-cost-per-unit.js" (
    call node scripts\add-cost-per-unit.js
)
call npx prisma generate
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo    Build complete: OK
echo.

echo =========================================================
echo  SUCCESS: Localhost POS is ready on this PC!
echo =========================================================
echo.
echo  To launch the POS server right now:
echo    1. Double-click:  start-pos.bat
echo    2. Open your browser:  http://localhost:3000
echo.
echo  Waiters and tables can connect on the local Wi-Fi:
echo    http://[THIS-PC-IP]:3000
echo =========================================================
echo.
pause
