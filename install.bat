@echo off
title Nexus PC Command Center - 1-Click Installer
cd /d "%~dp0"

:: -------------------------------------------------------------
:: Self-Elevate to Administrator if not already elevated
:: -------------------------------------------------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `"%~f0`"' -Verb RunAs"
    exit /b
)

echo =====================================================================
echo    NEXUS PC COMMAND CENTER - AUTOMATED INSTALLATION SETUP
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-task.ps1"

echo.
echo =====================================================================
echo Installation process completed.
echo You can manage your PC remotely from: https://nexus.hajimammad.com
echo =====================================================================
echo.
pause
