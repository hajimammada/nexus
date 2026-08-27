Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing

# =========================================================================
# Nexus PC Command Center - Native Windows Graphical Installer Wizard
# =========================================================================

# Check and auto-elevate to Administrator with STA mode
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isSTA = [System.Threading.Thread]::CurrentThread.GetApartmentState() -eq [System.Threading.ApartmentState]::STA

if (-not $isAdmin -or -not $isSTA) {
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Sta -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$scriptDir = Split-Path -Parent $PSCommandPath
$xamlFile = Join-Path $scriptDir "wizard.xaml"

if (Test-Path $xamlFile) {
    $stream = [System.IO.File]::OpenRead($xamlFile)
    $reader = [System.Xml.XmlReader]::Create($stream)
    $window = [System.Windows.Markup.XamlReader]::Load($reader)
    $stream.Close()
} else {
    Write-Host "Error: wizard.xaml not found at $xamlFile" -ForegroundColor Red
    exit 1
}

# Get Controls
$Page1 = $window.FindName("Page1")
$Page2 = $window.FindName("Page2")
$Page3 = $window.FindName("Page3")
$Page4 = $window.FindName("Page4")
$BtnBack = $window.FindName("BtnBack")
$BtnNext = $window.FindName("BtnNext")
$BtnFinish = $window.FindName("BtnFinish")
$BtnOpenDashboard = $window.FindName("BtnOpenDashboard")
$ProgressStatus = $window.FindName("ProgressStatus")
$ProgressDetail = $window.FindName("ProgressDetail")
$InstallProgress = $window.FindName("InstallProgress")
$PinDisplay = $window.FindName("PinDisplay")
$OptOpenSSH = $window.FindName("OptOpenSSH")
$OptFirewall = $window.FindName("OptFirewall")
$OptService = $window.FindName("OptService")

$currentStep = 1
$pairCodeResult = "READY"
$dashboardUrl = "https://nexus.hajimammad.com"

# Navigation Logic
$BtnNext.Add_Click({
    if ($script:currentStep -eq 1) {
        $script:currentStep = 2
        $Page1.Visibility = [System.Windows.Visibility]::Collapsed
        $Page2.Visibility = [System.Windows.Visibility]::Visible
        $BtnBack.Visibility = [System.Windows.Visibility]::Visible
        $BtnNext.Content = "Install >"
    } elseif ($script:currentStep -eq 2) {
        $script:currentStep = 3
        $Page2.Visibility = [System.Windows.Visibility]::Collapsed
        $Page3.Visibility = [System.Windows.Visibility]::Visible
        $BtnBack.Visibility = [System.Windows.Visibility]::Collapsed
        $BtnNext.Visibility = [System.Windows.Visibility]::Collapsed

        # Execute Installation in background timer
        $timer = New-Object System.Windows.Forms.Timer
        $timer.Interval = 200
        $timer.Add_Tick({
            $timer.Stop()
            
            # Step 1: OpenSSH
            if ($OptOpenSSH.IsChecked) {
                $ProgressStatus.Text = "Configuring OpenSSH Server..."
                $ProgressDetail.Text = "Enabling native Windows remote unlock capability..."
                $InstallProgress.Value = 30
                [System.Windows.Forms.Application]::DoEvents()
                
                try {
                    $sshCap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
                    if ($sshCap.State -ne 'Installed') {
                        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
                    }
                    Start-Service sshd -ErrorAction SilentlyContinue
                    Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction SilentlyContinue
                } catch {}
            }

            # Step 2: Firewall
            if ($OptFirewall.IsChecked) {
                $ProgressStatus.Text = "Configuring Windows Firewall..."
                $ProgressDetail.Text = "Verifying inbound ports 48880 and 22..."
                $InstallProgress.Value = 60
                [System.Windows.Forms.Application]::DoEvents()

                if (-not (Get-NetFirewallRule -Name "NexusAgentPort" -ErrorAction SilentlyContinue)) {
                    New-NetFirewallRule -Name "NexusAgentPort" -DisplayName "Nexus PC Agent (Port 48880)" -Direction Inbound -Protocol TCP -LocalPort 48880 -Action Allow -ErrorAction SilentlyContinue | Out-Null
                }
                if (-not (Get-NetFirewallRule -Name "NexusOpenSSH" -ErrorAction SilentlyContinue)) {
                    New-NetFirewallRule -Name "NexusOpenSSH" -DisplayName "OpenSSH Server (Port 22)" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -ErrorAction SilentlyContinue | Out-Null
                }
            }

            # Step 3: Register Service
            if ($OptService.IsChecked) {
                $ProgressStatus.Text = "Registering Background Service..."
                $ProgressDetail.Text = "Creating Scheduled Task under SYSTEM account..."
                $InstallProgress.Value = 85
                [System.Windows.Forms.Application]::DoEvents()

                $agentDir = Join-Path $scriptDir "agent"
                if (-not (Test-Path $agentDir)) {
                    $agentDir = "$env:ProgramFiles\NexusPCAgent\agent"
                }

                $nodePath = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
                if (-not $nodePath) { $nodePath = "C:\Program Files\nodejs\node.exe" }
                $serverJs = Join-Path $agentDir "server.js"

                Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue

                if (Test-Path $serverJs) {
                    $action = New-ScheduledTaskAction -Execute "$nodePath" -Argument "`"$serverJs`"" -WorkingDirectory "$agentDir"
                    $trigger = New-ScheduledTaskTrigger -AtStartup
                    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
                    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
                    Register-ScheduledTask -TaskName "NexusPCAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Nexus PC Companion Agent Boot Service" -Force | Out-Null
                    Start-ScheduledTask -TaskName "NexusPCAgent"
                }
            }

            # Finalize
            $InstallProgress.Value = 100
            $ProgressStatus.Text = "Querying 6-Digit Pairing PIN..."
            Start-Sleep -Milliseconds 1000

            # Try to fetch pairing code from running agent
            try {
                $info = Invoke-RestMethod -Uri "http://localhost:48880/api/pairing" -TimeoutSec 3 -ErrorAction SilentlyContinue
                if ($info -and $info.pairCode) {
                    $script:pairCodeResult = $info.pairCode
                    $script:dashboardUrl = $info.dashboardUrl
                }
            } catch {}

            $PinDisplay.Text = if ($script:pairCodeResult) { $script:pairCodeResult } else { "ACTIVE" }

            $script:currentStep = 4
            $Page3.Visibility = [System.Windows.Visibility]::Collapsed
            $Page4.Visibility = [System.Windows.Visibility]::Visible
            $BtnFinish.Visibility = [System.Windows.Visibility]::Visible
        })
        $timer.Start()
    }
})

$BtnBack.Add_Click({
    if ($script:currentStep -eq 2) {
        $script:currentStep = 1
        $Page2.Visibility = [System.Windows.Visibility]::Collapsed
        $Page1.Visibility = [System.Windows.Visibility]::Visible
        $BtnBack.Visibility = [System.Windows.Visibility]::Collapsed
        $BtnNext.Content = "Next >"
    }
})

$BtnOpenDashboard.Add_Click({
    Start-Process $script:dashboardUrl
})

$BtnFinish.Add_Click({
    $window.Close()
})

# Show the GUI Window
$window.ShowDialog() | Out-Null
