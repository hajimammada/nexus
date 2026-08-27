@echo off
title Nexus Remote Agent (Public Tunnel)
cd /d "%~dp0\agent"
node tunnel.js
pause
