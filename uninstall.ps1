# =========================================================================
# Nexus PC Agent Automated Uninstaller (Admin)
# =========================================================================

$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Yellow
Write-Host "🗑️  Uninstalling Nexus PC Command Center Services..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Yellow

try {
    # 1. Stop and Unregister Task Scheduler Boot Service
    Write-Host "Stopping and removing Task Scheduler service..." -ForegroundColor Cyan
    Stop-ScheduledTask -TaskName "NexusPCAgent" -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "NexusPCAgent" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Write-Host "✓ Scheduled task 'NexusPCAgent' removed." -ForegroundColor Green

    # 2. Stop any orphaned node processes from NexusAgent
    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*NexusAgent*" }
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }

    # 3. Remove Windows Firewall Rules
    Write-Host "Removing Firewall rules..." -ForegroundColor Cyan
    Remove-NetFirewallRule -Name "NexusAgentPort" -ErrorAction SilentlyContinue | Out-Null
    Remove-NetFirewallRule -Name "NexusOpenSSH" -ErrorAction SilentlyContinue | Out-Null
    Write-Host "✓ Firewall rules removed." -ForegroundColor Green

    # 4. Remove installation directory
    $targetBaseDir = Join-Path $env:ProgramData "NexusAgent"
    if (Test-Path $targetBaseDir) {
        Write-Host "Removing $targetBaseDir..." -ForegroundColor Cyan
        Remove-Item -Path $targetBaseDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "✓ Installation files removed." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "🎉 NEXUS PC AGENT UNINSTALLED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "All background services, tasks, and files have been removed."
    Write-Host "========================================================" -ForegroundColor Green
} catch {
    Write-Host "❌ Uninstall error: $($_.Exception.Message)" -ForegroundColor Red
}
