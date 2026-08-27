@echo off
title Nexus Command Center - Dev Mode
cd /d "%~dp0"

echo ========================================================
echo Starting Nexus PC Companion Agent...
echo ========================================================
start "Nexus PC Agent" cmd /c "cd agent && node server.js"

echo ========================================================
echo Starting Nexus Dashboard Web Client...
echo ========================================================
cd client
npm run dev
pause
