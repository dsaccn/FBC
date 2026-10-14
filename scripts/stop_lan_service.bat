@echo off
echo Stopping Kogna Coffee local services...
taskkill /F /IM cloudflared.exe 2>nul
echo Done.
