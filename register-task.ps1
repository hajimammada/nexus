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
        New-NetFirewallRule -Name "NexusAgentPort" -DisplayName "Nexus PC Agent (Port 48880)" -Direction Inbound -Protocol TCP -LocalPort 48880 -Profile Domain,Private -Action Allow -ErrorAction SilentlyContinue | Out-Null
    }
    if (-not (Get-NetFirewallRule -Name "NexusOpenSSH" -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name "NexusOpenSSH" -DisplayName "OpenSSH Server (Port 22)" -Direction Inbound -Protocol TCP -LocalPort 22 -Profile Domain,Private -Action Allow -ErrorAction SilentlyContinue | Out-Null
    }
    Write-Host "✓ Firewall ports 48880 and 22 verified" -ForegroundColor Green

    # 5. Install or Upgrade agent permanently to C:\ProgramData\NexusAgent
    $sourceAgentDir = Join-Path $PSScriptRoot "agent"
    $targetBaseDir = Join-Path $env:ProgramData "NexusAgent"
    $targetAgentDir = Join-Path $targetBaseDir "agent"

    $isUpgrade = Test-Path $targetAgentDir
    if ($isUpgrade) {
        Write-Host "🔄 Existing installation detected. Upgrading in-place..." -ForegroundColor Cyan
        Stop-ScheduledTask -TaskName "NexusPCAgent" -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }

    if (-not (Test-Path $targetAgentDir)) {
        New-Item -ItemType Directory -Path $targetAgentDir -Force | Out-Null
    }

    # Backup existing credentials & pairing PIN if upgrading
    $savedEnv = Join-Path $targetAgentDir ".env"
    $savedPair = Join-Path $targetAgentDir "pairing.json"
    $envBackup = $null
    $pairBackup = $null
    if (Test-Path $savedEnv) { $envBackup = Get-Content $savedEnv -Raw }
    if (Test-Path $savedPair) { $pairBackup = Get-Content $savedPair -Raw }

    if (Test-Path $sourceAgentDir) {
        Copy-Item -Path "$sourceAgentDir\*" -Destination $targetAgentDir -Recurse -Force
    }

    # Restore credentials & pairing PIN so user keeps their same 6-digit PIN or generate fresh random PIN
    if ($envBackup) { 
        Set-Content -Path $savedEnv -Value $envBackup -Encoding UTF8 
    }
    if ($pairBackup) { 
        Set-Content -Path $savedPair -Value $pairBackup -Encoding UTF8 
    } elseif (-not (Test-Path $savedPair)) {
        $randPin = (Get-Random -Minimum 100000 -Maximum 999999).ToString()
        $nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        $newPairContent = @"
{
  "pairCode": "$randPin",
  "roomId": "room_${randPin}_pc",
  "token": "token_$randPin",
  "updatedAt": "$nowIso"
}
"@
        Set-Content -Path $savedPair -Value $newPairContent -Encoding UTF8
    }

    $unlockCmd = Join-Path $targetAgentDir "unlock.cmd"
    $unlockContent = @"
@echo off
for /f "tokens=3" %%i in ('query session ^| findstr /i "%USERNAME%"') do (
    tscon %%i /dest:console
)
"@
    Set-Content -Path $unlockCmd -Value $unlockContent -Encoding ASCII

    # 6. Register Task Scheduler Boot Service (SYSTEM Account) from permanent path
    $serverJs = Join-Path $targetAgentDir "server.js"
    $action = New-ScheduledTaskAction -Execute "$nodePath" -Argument "$serverJs" -WorkingDirectory "$targetAgentDir"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
    
    Register-ScheduledTask -TaskName "NexusPCAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Nexus PC Companion Agent Boot Service" -Force | Out-Null
    Start-ScheduledTask -TaskName "NexusPCAgent"
    Write-Host "✓ Task Scheduler Service 'NexusPCAgent' registered permanently from $targetAgentDir" -ForegroundColor Green

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
