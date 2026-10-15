@echo off
cd /d "c:\Users\dawit\OneDrive\Documents\managment\FBC"
"c:\Users\dawit\OneDrive\Documents\managment\FBC\bin\cloudflared.exe" tunnel --url http://localhost:3000 --http-host-header localhost:3000 --protocol http2 --no-autoupdate --logfile "c:\Users\dawit\OneDrive\Documents\managment\FBC\logs\tunnel.log"
