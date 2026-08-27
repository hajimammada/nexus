@echo off
title Install Nexus Agent to Windows Startup (Auto-Start on Boot)
cd /d "%~dp0"

set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_FILE=%STARTUP_DIR%\nexus-pc-agent.vbs
set SCRIPT_PATH=%~dp0agent\server.js
set AGENT_DIR=%~dp0agent

echo Set WshShell = CreateObject("WScript.Shell") > "%VBS_FILE%"
echo WshShell.CurrentDirectory = "%AGENT_DIR%" >> "%VBS_FILE%"
echo WshShell.Run "node """ ^& "%SCRIPT_PATH%" ^& """", 0, False >> "%VBS_FILE%"

echo ========================================================
echo [SUCCESS] Nexus PC Agent has been added to Windows Startup!
echo It will now run silently in the background on every boot.
echo ========================================================
pause
