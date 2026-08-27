# =========================================================================
# Nexus PC Agent 1-Click Automated PowerShell Web Installer
# Usage: irm https://nexus.hajimammad.com/install-pc.ps1 | iex
# =========================================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 Downloading & Installing Nexus PC Command Center..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Require Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"irm https://nexus.hajimammad.com/install-pc.ps1 | iex`"" -Verb RunAs
    exit
}

# 2. Setup directory
$targetDir = "$env:ProgramFiles\NexusPCAgent"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$zipPath = "$env:TEMP\nexus-pc-agent.zip"
Write-Host "Downloading agent package..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://github.com/hajimammada/nexus/archive/refs/heads/main.zip" -OutFile $zipPath

Write-Host "Extracting files..." -ForegroundColor Cyan
$tempExtract = "$env:TEMP\nexus-extract"
if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force

Copy-Item -Path "$tempExtract\nexus-main\*" -Destination $targetDir -Recurse -Force
Remove-Item $zipPath -Force
Remove-Item $tempExtract -Recurse -Force

# 3. Run installation script
Write-Host "Running service registration..." -ForegroundColor Cyan
Set-Location $targetDir
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$targetDir\register-task.ps1"

Write-Host ""
Write-Host "Installation completed! PC Agent is active at: $targetDir" -ForegroundColor Green
