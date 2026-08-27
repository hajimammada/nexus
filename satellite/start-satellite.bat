@echo off
title Nexus Universal Satellite Relay
cd /d "%~dp0"
echo ========================================================
echo  Starting Nexus Satellite Home Relay (Port 5050)...
echo ========================================================
node server.js
pause
