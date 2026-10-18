@echo off
setlocal
pushd "%~dp0.."
set "POS_DIR=%CD%"
popd
cd /d "%POS_DIR%"

if not exist "%POS_DIR%\logs" mkdir "%POS_DIR%\logs"

if not exist "%POS_DIR%\bin\cloudflared.exe" (
    echo [%DATE% %TIME%] [ERROR] cloudflared.exe was not found in %POS_DIR%\bin\ >> "%POS_DIR%\logs\tunnel.log"
    exit /b 1
)

"%POS_DIR%\bin\cloudflared.exe" tunnel --protocol http2 run --token eyJhIjoiNTEwZjkyMDE2MmEwZWFmMjc4YTlmMDY1ZmI3ZjJjOTAiLCJ0IjoiYTA2MmY4MDgtMDFiMy00OWUwLWIwNjgtMjAyOGZlMDE2NTI3IiwicyI6Ik1tTXhPVGRsWTJVdE1HSXpZeTAwTnpBNUxXRmxNamt0TXpReU1USmtZemxqTUdNMyJ9 --logfile "%POS_DIR%\logs\tunnel.log"
