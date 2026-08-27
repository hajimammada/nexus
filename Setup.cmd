@echo off
title Nexus PC Setup Wizard
cd /d "%~dp0"

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c `"%~f0`"' -Verb RunAs"
    exit /b
)

:: Launch Native Windows GUI Wizard
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0wizard.ps1"
exit /b
