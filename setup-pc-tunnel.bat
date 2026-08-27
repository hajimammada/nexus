@echo off
title Setup Cloudflare Tunnel for Remote PC Agent
cd /d "%~dp0"
echo =====================================================================
echo  Cloudflare Tunnel Setup Guide for Remote PC Agent
echo =====================================================================
echo.
echo Option 1 (Recommended - 2 Minutes via Cloudflare Dashboard):
echo -------------------------------------------------------------
echo 1. Open https://dash.cloudflare.com
echo 2. Go to "Zero Trust" -> "Networks" -> "Tunnels" -> "Create a Tunnel"
echo 3. Name your tunnel: "my-pc-agent"
echo 4. Copy the Windows command and run it in an Administrator command prompt.
echo 5. In the "Public Hostnames" tab, add:
echo      Subdomain: pcagent
echo      Domain:    yourdomain.com
echo      Type:      HTTP
echo      URL:       localhost:48880
echo 6. Done! https://pcagent.yourdomain.com will now permanently route to this PC!
echo.
echo =====================================================================
echo Option 2 (Quick Token Run):
echo -------------------------------------------------------------
echo If you have a Cloudflare Tunnel Token, paste it below to run:
set /p CLOUDFLARE_TOKEN="Enter Cloudflare Tunnel Token (or press Enter to skip): "
if not "%CLOUDFLARE_TOKEN%"=="" (
    echo Starting tunnel with token...
    npx cloudflared tunnel --token %CLOUDFLARE_TOKEN% run
)
pause
