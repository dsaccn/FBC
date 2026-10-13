@echo off
:: =========================================================
:: Kogna Coffee POS — Offline Package Creator
:: Run this script on the source PC to package the application
:: into a single zip file for offline transfer.
:: =========================================================

set "POS_DIR=%~dp0"
set "DIST_DIR=%POS_DIR%kogna-coffee-pos-dist"
set "ZIP_FILE=%POS_DIR%kogna-coffee-pos-offline.zip"

echo.
echo =========================================================
echo       KOGNA COFFEE POS — CREATE OFFLINE PACKAGE
echo =========================================================
echo.

:: Clean up previous runs
if exist "%DIST_DIR%" (
    echo [1/5] Cleaning up old temporary directories...
    rmdir /s /q "%DIST_DIR%"
)
if exist "%ZIP_FILE%" (
    echo [1/5] Removing old zip package...
    del /f /q "%ZIP_FILE%"
)

echo [2/5] Building the Next.js production app...
cd /d "%POS_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Please resolve build errors first.
    pause
    exit /b 1
)

echo.
echo [3/5] Copying application files to distribution directory...
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\prisma"
mkdir "%DIST_DIR%\public"
mkdir "%DIST_DIR%\src"
mkdir "%DIST_DIR%\scripts"

:: Copy code and configs
xcopy /E /I /Y "public" "%DIST_DIR%\public" >nul
xcopy /E /I /Y "src" "%DIST_DIR%\src" >nul
xcopy /E /I /Y "prisma" "%DIST_DIR%\prisma" >nul
xcopy /E /I /Y "scripts" "%DIST_DIR%\scripts" >nul

copy ".env" "%DIST_DIR%\" >nul
copy "package.json" "%DIST_DIR%\" >nul
copy "package-lock.json" "%DIST_DIR%\" >nul
copy "next.config.ts" "%DIST_DIR%\" >nul
copy "postcss.config.mjs" "%DIST_DIR%\" >nul
copy "tsconfig.json" "%DIST_DIR%\" >nul
copy "install-online.bat" "%DIST_DIR%\" >nul
copy "install-offline.bat" "%DIST_DIR%\" >nul
copy "setup-and-autostart.bat" "%DIST_DIR%\" >nul
copy "start-silent.vbs" "%DIST_DIR%\" >nul
copy "start-pos.bat" "%DIST_DIR%\" >nul
copy "stop-pos.bat" "%DIST_DIR%\" >nul
copy "update-pos.bat" "%DIST_DIR%\" >nul
copy "package-offline.bat" "%DIST_DIR%\" >nul
copy "fix-readonly-db.bat" "%DIST_DIR%\" >nul
copy "README.md" "%DIST_DIR%\" >nul

:: Copy Node.js installer if present
if exist "%POS_DIR%node-v22.14.0-x64.msi" (
    echo Copying Node.js installer into package...
    copy "%POS_DIR%node-v22.14.0-x64.msi" "%DIST_DIR%\" >nul
)

echo.
echo [4/5] Copying node_modules and production build...
mkdir "%DIST_DIR%\node_modules"
robocopy "node_modules" "%DIST_DIR%\node_modules" /E /XD .cache /NFL /NDL /NJH /NJS >nul
if %errorlevel% geq 8 (
    echo Warning: Robocopy returned code %errorlevel%, falling back to xcopy...
    xcopy /E /I /Y "node_modules" "%DIST_DIR%\node_modules" >nul
)

mkdir "%DIST_DIR%\.next"
robocopy ".next" "%DIST_DIR%\.next" /E /XD cache /NFL /NDL /NJH /NJS >nul
if %errorlevel% geq 8 (
    xcopy /E /I /Y ".next" "%DIST_DIR%\.next" >nul
)

echo.
echo [5/5] Compressing files into %ZIP_FILE%...
where tar.exe >nul 2>&1
if %errorlevel% equ 0 (
    tar.exe -a -c -f "%ZIP_FILE%" -C "%DIST_DIR%" .
) else (
    powershell -Command "Compress-Archive -Path '%DIST_DIR%\*' -DestinationPath '%ZIP_FILE%' -Force"
)

if %errorlevel% neq 0 (
    echo [ERROR] Failed to compress folder.
    pause
    exit /b 1
)

echo.
echo Cleaning up temporary directory...
rmdir /s /q "%DIST_DIR%"

echo.
echo =========================================================
echo  SUCCESS: Offline installation package created!
echo =========================================================
echo  Package Location: 
echo  %ZIP_FILE%
echo.
echo  Instructions for the Offline PC:
echo   1. Copy %ZIP_FILE% to a USB drive.
echo   2. Plug USB into the target offline PC.
echo   3. Extract %ZIP_FILE% to C:\KognaCoffeePOS (or Desktop).
echo   4. If Node.js is not installed, double-click node-v22.14.0-x64.msi.
echo   5. Right-click install-offline.bat and choose 'Run as administrator'.
echo   6. Double-click the 'Start Kogna POS' desktop shortcut to run!
echo =========================================================
echo.
pause
