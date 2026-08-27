@echo off
title Nexus PC Agent
cd /d "%~dp0"
echo ========================================================
echo Starting Nexus PC Companion Agent...
echo ========================================================
node server.js
pause
