@echo off
title Nexus PC Setup Wizard
cd /d "%~dp0"

:: Auto-elevate to Administrator and launch STA WPF Wizard directly
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Sta -File `\"%~dp0wizard.ps1`\"' -Verb RunAs"
    exit /b
)

:: Launch Native Windows GUI Wizard in STA mode
powershell.exe -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0wizard.ps1"
exit /b
