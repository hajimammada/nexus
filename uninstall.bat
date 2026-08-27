@echo off
title Nexus PC Agent - 1-Click Uninstaller
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
echo    NEXUS PC COMMAND CENTER - AUTOMATED UNINSTALLER
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"

echo.
echo =====================================================================
echo Uninstallation completed.
echo =====================================================================
echo.
pause
