@echo off
title Deploy Nexus to Cloudflare
cd /d "%~dp0"
echo ========================================================
echo 1. Building latest frontend assets...
echo ========================================================
call npm run build

echo ========================================================
echo 2. Deploying directly to Cloudflare...
echo ========================================================
echo.
npx wrangler deploy
echo.
echo ========================================================
echo Deployment finished!
echo ========================================================
pause
