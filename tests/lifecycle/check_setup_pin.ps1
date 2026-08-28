Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$setupPath = "c:\Users\aliye\Projects\AntigravityWorkspace\nexus-dashboard_standard\Setup.exe"
$proc = Start-Process $setupPath -PassThru
Start-Sleep -Seconds 2

$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "Nexus PC Command Center Setup")
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)

if ($window) {
    $textCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
    $texts = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $textCondition)

    foreach ($t in $texts) {
        if ($t.Current.Name -like "*PIN*" -or $t.Current.Name -like "*Current*") {
            Write-Host "GUI TEXT FOUND: '$($t.Current.Name)'"
        }
    }
}

if (-not $proc.HasExited) { $proc.Kill() }
