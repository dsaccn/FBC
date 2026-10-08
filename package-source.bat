@echo off
:: =========================================================
:: Kogna Coffee POS — Lightweight Package Creator
:: Packages code, database, and setup scripts without node_modules.
:: Ideal for copying to another PC via USB or Telegram (takes seconds).
:: =========================================================

set "POS_DIR=%~dp0"
set "DIST_DIR=%POS_DIR%kogna-coffee-pos-source"
set "ZIP_FILE=%POS_DIR%kogna-coffee-pos-online-setup.zip"

echo.
echo ==========================================
echo  Kogna Coffee POS — Create Online Setup ZIP
echo ==========================================
echo.

:: Clean up previous runs
if exist "%DIST_DIR%" (
    echo [1/4] Cleaning up old temporary directories...
    rmdir /s /q "%DIST_DIR%"
)
if exist "%ZIP_FILE%" (
    echo [1/4] Removing old zip package...
    del /f /q "%ZIP_FILE%"
)

echo [2/4] Copying source files to distribution directory...
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\prisma"
mkdir "%DIST_DIR%\public"
mkdir "%DIST_DIR%\src"

:: Copy code and configs (excluding node_modules and .next)
xcopy /E /I /Y "public" "%DIST_DIR%\public" >nul
xcopy /E /I /Y "src" "%DIST_DIR%\src" >nul
xcopy /E /I /Y "prisma" "%DIST_DIR%\prisma" >nul

copy ".env" "%DIST_DIR%\" >nul
copy "package.json" "%DIST_DIR%\" >nul
copy "package-lock.json" "%DIST_DIR%\" >nul
copy "next.config.ts" "%DIST_DIR%\" >nul
copy "postcss.config.mjs" "%DIST_DIR%\" >nul
copy "tsconfig.json" "%DIST_DIR%\" >nul
copy "install-online.bat" "%DIST_DIR%\" >nul
copy "install-offline.bat" "%DIST_DIR%\" >nul
copy "setup-autostart.bat" "%DIST_DIR%\" >nul
copy "start-pos.bat" "%DIST_DIR%\" >nul
copy "stop-pos.bat" "%DIST_DIR%\" >nul
copy "README.md" "%DIST_DIR%\" >nul

:: Copy utility js files in root
copy "*.js" "%DIST_DIR%\" >nul 2>&1

echo.
echo [3/4] Compressing source files into %ZIP_FILE%...
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
echo [4/4] Cleaning up temporary files...
rmdir /s /q "%DIST_DIR%"

echo.
echo =========================================================
echo  SUCCESS: Lightweight ZIP package created!
echo =========================================================
echo  File location: 
echo  %ZIP_FILE%
echo.
echo  This file is tiny (~1-2 MB) and includes your complete
echo  local database (prisma/diva-addis.db) and .env configuration.
echo =========================================================
echo.
pause
