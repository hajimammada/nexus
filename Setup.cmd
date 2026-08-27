@echo off
title Nexus PC Setup Wizard
cd /d "%~dp0"

echo ===================================================
echo   Nexus PC Command Center Setup
echo ===================================================
echo Launching Setup Wizard...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Sta -WindowStyle Normal -Command "& { & '%~dp0wizard.ps1' }"

if %errorlevel% neq 0 (
    echo.
    echo Setup exited with an error code: %errorlevel%
    echo Press any key to close this window...
    pause >nul
)
