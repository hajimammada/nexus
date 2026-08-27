@echo off
title Nexus Remote Agent (Control from Anywhere)
cd /d "%~dp0"
echo ========================================================
echo Launching Nexus Agent with Cloudflare Remote Tunnel...
echo ========================================================
node tunnel.js
pause
