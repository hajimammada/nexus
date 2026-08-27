@echo off
title Nexus PC Agent - Reset Pairing PIN
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

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset-pin.ps1"

echo.
pause
