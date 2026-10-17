@echo off
setlocal
echo ========================================================
echo   Kogna POS - Create Silent Print Shortcut (No Popups)
echo ========================================================
echo.
set "TARGET_URL=http://localhost:3000"
set /p "USER_URL=Enter POS Server URL (press Enter for default http://localhost:3000): "
if not "%USER_URL%"=="" set "TARGET_URL=%USER_URL%"

echo.
echo Creating Desktop shortcut for: %TARGET_URL% with --kiosk-printing...
powershell -ExecutionPolicy Bypass -File "%~dp0create_silent_print_shortcut.ps1" -TargetUrl "%TARGET_URL%"
echo.
pause
