# =========================================================================
# Nexus PC Agent - Reset Pairing PIN (Admin)
# =========================================================================

$ErrorActionPreference = "Continue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "🔄 Resetting 6-Digit Pairing PIN for this PC..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

try {
    $targetBaseDir = Join-Path $env:ProgramData "NexusAgent"
    $targetAgentDir = Join-Path $targetBaseDir "agent"
    $savedPair = Join-Path $targetAgentDir "pairing.json"

    # 1. Stop the running service
    Stop-ScheduledTask -TaskName "NexusPCAgent" -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    # 2. Remove old pairing file so a fresh random 6-digit PIN is generated
    if (Test-Path $savedPair) {
        Remove-Item -Path $savedPair -Force
    }

    # 3. Restart the background agent
    Start-ScheduledTask -TaskName "NexusPCAgent"
    Start-Sleep -Seconds 3

    # 4. Read the new PIN
    if (Test-Path $savedPair) {
        $pairData = Get-Content $savedPair | ConvertFrom-Json
        $newPin = $pairData.pairCode

        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "🎉 NEW PAIRING PIN GENERATED: [ $newPin ]" -ForegroundColor Green
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "Dashboard Link: https://nexus.hajimammad.com/#pair=$newPin" -ForegroundColor Cyan
        Write-Host "Enter this new PIN in your Android app to link your phone."
        Write-Host "========================================================" -ForegroundColor Green
    } else {
        Write-Host "✓ PIN reset requested. Check your agent activity log for the new PIN." -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Error resetting PIN: $($_.Exception.Message)" -ForegroundColor Red
}
