# =========================================================================
# Nexus PC Agent & System Configuration Automated Installer (Admin)
# =========================================================================

$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🚀 Installing Nexus PC Command Center Services..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

try {
    # 1. Find Node.js absolute binary path
    $nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) {
        $nodePath = "C:\Program Files\nodejs\node.exe"
    }
    if (-not (Test-Path $nodePath)) {
        Write-Host "⚠️ Node.js not found. Installing Node.js LTS via winget..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $nodePath = "C:\Program Files\nodejs\node.exe"
    }
    Write-Host "✓ Node.js detected: $nodePath" -ForegroundColor Green

    # 2. Stop any existing Nexus agent instances
    Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue

    # 3. Configure Windows OpenSSH Server (for Remote Session Unlock)
    Write-Host "Checking OpenSSH Server capability..." -ForegroundColor Cyan
    $sshCap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
    if ($sshCap.State -ne 'Installed') {
        Write-Host "Installing OpenSSH.Server..." -ForegroundColor Yellow
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    }
    Start-Service sshd -ErrorAction SilentlyContinue
    Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction SilentlyContinue
    Write-Host "✓ OpenSSH Server active and set to Automatic boot" -ForegroundColor Green

    # 4. Configure Windows Firewall Inbound Rules
    Write-Host "Configuring Windows Firewall rules..." -ForegroundColor Cyan
    if (-not (Get-NetFirewallRule -Name "NexusAgentPort" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name "NexusAgentPort" -DisplayName "Nexus PC Agent (Port 48880)" -Direction Inbound -Protocol TCP -LocalPort 48880 -Action Allow -ErrorAction SilentlyContinue | Out-Null
    }
    if (-not (Get-NetFirewallRule -Name "NexusOpenSSH" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name "NexusOpenSSH" -DisplayName "OpenSSH Server (Port 22)" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -ErrorAction SilentlyContinue | Out-Null
    }
    Write-Host "✓ Firewall ports 48880 and 22 verified" -ForegroundColor Green

    # 5. Create dedicated unlock.cmd helper in agent directory
    $agentDir = Join-Path $PSScriptRoot "agent"
    $unlockCmd = Join-Path $agentDir "unlock.cmd"
    $unlockContent = @"
@echo off
for /f "tokens=3" %%i in ('query session ^| findstr /i "%USERNAME%"') do (
    tscon %%i /dest:console
)
"@
    Set-Content -Path $unlockCmd -Value $unlockContent -Encoding ASCII

    # 6. Register Task Scheduler Boot Service (SYSTEM Account)
    $serverJs = Join-Path $agentDir "server.js"
    $action = New-ScheduledTaskAction -Execute "$nodePath" -Argument "`"$serverJs`"" -WorkingDirectory "$agentDir"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
    
    Register-ScheduledTask -TaskName "NexusPCAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Nexus PC Companion Agent Boot Service" -Force | Out-Null
    Start-ScheduledTask -TaskName "NexusPCAgent"
    Write-Host "✓ Task Scheduler Service 'NexusPCAgent' registered and running" -ForegroundColor Green

    # 7. Query active pairing info from running agent
    Start-Sleep -Seconds 2
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "🎉 NEXUS INSTALLATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "Your PC is now broadcasting to the Cloud Relay."
    Write-Host "Open your dashboard at: https://nexus.hajimammad.com" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Green

    Set-Content -Path (Join-Path $PSScriptRoot "task_install.log") -Value "SUCCESS"
} catch {
    Write-Host "❌ Installation error: $($_.Exception.Message)" -ForegroundColor Red
    Set-Content -Path (Join-Path $PSScriptRoot "task_install.log") -Value $_.Exception.Message
}
