@echo off
title Clear All POS Orders and Payments
echo ====================================================
echo   CLEARING ALL ORDERS AND PAYMENTS (OFFLINE & ONLINE)
echo ====================================================
echo.
cd /d "%~dp0"
npx tsx clear_all.ts
echo.
pause
