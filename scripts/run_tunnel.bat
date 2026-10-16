@echo off
setlocal
pushd "%~dp0.."
set "POS_DIR=%CD%"
popd
cd /d "%POS_DIR%"

if not exist "%POS_DIR%\logs" mkdir "%POS_DIR%\logs"

if not exist "%POS_DIR%\bin\cloudflared.exe" (
    echo [%DATE% %TIME%] [ERROR] cloudflared.exe was not found in %POS_DIR%\bin\ >> "%POS_DIR%\logs\tunnel.log"
    echo [ERROR] cloudflared.exe was not found in %POS_DIR%\bin\
    exit /b 1
)

"%POS_DIR%\bin\cloudflared.exe" tunnel --protocol http2 run --token eyJhIjoiM2UzNjljODU4YTllY2NhYTExNDkzZTIwNDhjODI0MmMiLCJ0IjoiZGM1ZTliYjYtNTU5Mi00YjgzLTlkMTMtYjA2MGExZmQyNzQzIiwicyI6Ik5tWmlNamMyWmpNdE5qVTBOQzAwWkRJNUxUZzBaVEl0T0dOak4ySTROemRpWlRrNSJ9 --logfile "%POS_DIR%\logs\tunnel.log"
