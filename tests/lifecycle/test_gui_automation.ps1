Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$setupPath = "c:\Users\aliye\Projects\AntigravityWorkspace\nexus-dashboard_standard\Setup.exe"

Write-Host "========================================================"
Write-Host "🖥️  TESTING SETUP.EXE WPF GUI BUTTONS VIA UI AUTOMATION"
Write-Host "========================================================"

# Query initial PIN
$initialPin = (Invoke-RestMethod -Uri 'http://localhost:48880/api/pairing' -Method GET).pairCode
Write-Host "Initial Agent PIN before GUI test: [$initialPin]"

# 1. Launch Setup.exe
$proc = Start-Process $setupPath -PassThru
Start-Sleep -Seconds 2

# 2. Find Window via UIAutomation
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Nexus PC Command Center Setup")
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)

if ($null -eq $window) {
    Write-Host "❌ Failed to locate Setup.exe GUI window" -ForegroundColor Red
    if (-not $proc.HasExited) { $proc.Kill() }
    exit 1
}

Write-Host "✓ Located GUI Window: '$($window.Current.Name)'" -ForegroundColor Green

# 3. Enumerate all Buttons inside the GUI
$btnCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCondition)

Write-Host "Found $($buttons.Count) GUI Buttons in Setup window:"
foreach ($btn in $buttons) {
    Write-Host " -> Button: '$($btn.Current.Name)' (IsEnabled: $($btn.Current.IsEnabled))"
}

# 4. Click the 'Change / Reset 6-Digit PIN' Action Card (Button 2)
$resetBtn = $buttons[1]

if ($null -ne $resetBtn) {
    Write-Host "🎯 Programmatically clicking Action Card #2 (Reset PIN Button)..." -ForegroundColor Cyan
    $invokePattern = $resetBtn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invokePattern.Invoke()
    
    # Wait for Progress -> Finish Page transition
    Write-Host "Waiting for WPF async reset and UI page transition..."
    Start-Sleep -Seconds 3

    # Check new PIN after GUI click
    $newPin = (Invoke-RestMethod -Uri 'http://localhost:48880/api/pairing' -Method GET).pairCode
    Write-Host "New PIN after GUI Click: [$newPin]"
    
    if ($newPin -ne $initialPin -and $newPin.Length -eq 6) {
        Write-Host "🎉 SUCCESS: WPF GUI Button click triggered live PIN reset ($initialPin -> $newPin)!" -ForegroundColor Green
    } else {
        Write-Host "❌ PIN did not change" -ForegroundColor Red
    }
}

# 5. Close the window cleanly
if (-not $proc.HasExited) {
    $proc.CloseMainWindow() | Out-Null
    Start-Sleep -Milliseconds 500
    if (-not $proc.HasExited) { $proc.Kill() }
}

Write-Host "========================================================"
Write-Host "✓ GUI Button Automation Test Completed Cleanly!"
Write-Host "========================================================"
