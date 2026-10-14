@echo off
cd /d "c:\Users\dawit\OneDrive\Documents\managment\FBC"
"c:\Users\dawit\OneDrive\Documents\managment\FBC\bin\cloudflared.exe" tunnel --url http://localhost:3000 --logfile "c:\Users\dawit\OneDrive\Documents\managment\FBC\logs\tunnel.log"
