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

[xml]$xaml = @"
<Window 
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Nexus PC Command Center Setup" 
    Height="480" 
    Width="620" 
    WindowStartupLocation="CenterScreen" 
    ResizeMode="NoResize" 
    Background="#0c101c" 
    Foreground="#f8fafc"
    FontFamily="Segoe UI">

    <Window.Resources>
        <Style TargetType="Button">
            <Setter Property="Background" Value="#1e293b"/>
            <Setter Property="Foreground" Value="#f8fafc"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="16,8"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" 
                                BorderBrush="{TemplateBinding BorderBrush}" 
                                BorderThickness="{TemplateBinding BorderThickness}" 
                                CornerRadius="8">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
    </Window.Resources>

    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="70"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="65"/>
        </Grid.RowDefinitions>

        <!-- HEADER BAR -->
        <Border Grid.Row="0" Background="#111728" BorderBrush="#1e293b" BorderThickness="0,0,0,1" Padding="20,12">
            <Grid>
                <StackPanel VerticalAlignment="Center">
                    <TextBlock Name="HeaderTitle" Text="Nexus PC Setup Wizard" FontSize="16" FontWeight="Bold" Foreground="#38bdf8"/>
                    <TextBlock Name="HeaderSub" Text="Universal Remote Power, Security &amp; Telemetry Setup" FontSize="11" Foreground="#94a3b8"/>
                </StackPanel>
                <Border HorizontalAlignment="Right" Background="#0284c7" CornerRadius="12" Width="36" Height="36">
                    <TextBlock Text="⚡" FontSize="18" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>
            </Grid>
        </Border>

        <!-- MAIN BODY CONTENT (Pages) -->
        <Grid Grid.Row="1" Margin="24,16">

            <!-- PAGE 1: WELCOME -->
            <StackPanel Name="Page1" Visibility="Visible">
                <TextBlock Text="Welcome to Nexus PC Command Center" FontSize="18" FontWeight="Bold" Foreground="#ffffff" Margin="0,0,0,8"/>
                <TextBlock Text="This setup wizard will configure your PC for remote power management, Wake-on-LAN, and secure lock screen bypass." FontSize="12" Foreground="#cbd5e1" TextWrapping="Wrap" LineHeight="18" Margin="0,0,0,16"/>
                
                <Border Background="#131c31" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,10">
                    <StackPanel>
                        <TextBlock Text="What will be configured:" FontWeight="Bold" FontSize="12" Foreground="#38bdf8" Margin="0,0,0,8"/>
                        <TextBlock Text="• Windows OpenSSH Server (for 1-click screen unlock)" FontSize="11" Foreground="#cbd5e1" Margin="0,2"/>
                        <TextBlock Text="• Inbound Windows Firewall Rules (Ports 48880 &amp; 22)" FontSize="11" Foreground="#cbd5e1" Margin="0,2"/>
                        <TextBlock Text="• 24/7 Background Service (Runs at boot before login)" FontSize="11" Foreground="#cbd5e1" Margin="0,2"/>
                        <TextBlock Text="• Outbound WebSocket Cloud Relay connection" FontSize="11" Foreground="#cbd5e1" Margin="0,2"/>
                    </StackPanel>
                </Border>

                <TextBlock Text="Click 'Next' to continue setup." FontSize="11" Foreground="#64748b" Margin="0,10,0,0"/>
            </StackPanel>

            <!-- PAGE 2: OPTIONS -->
            <StackPanel Name="Page2" Visibility="Collapsed">
                <TextBlock Text="Installation Options" FontSize="18" FontWeight="Bold" Foreground="#ffffff" Margin="0,0,0,8"/>
                <TextBlock Text="Select the components you want to enable on this machine:" FontSize="12" Foreground="#94a3b8" Margin="0,0,0,16"/>

                <Border Background="#131c31" BorderBrush="#1e293b" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,10">
                    <StackPanel>
                        <CheckBox Name="OptOpenSSH" Content="Enable Windows OpenSSH Server (Bypass Lock Screen)" IsChecked="True" Foreground="#f8fafc" FontSize="12" Margin="0,6"/>
                        <TextBlock Text="Allows remote unlocking of your Windows console session from phone." FontSize="10" Foreground="#64748b" Margin="24,0,0,8"/>

                        <CheckBox Name="OptFirewall" Content="Configure Windows Firewall Rules (Ports 48880 &amp; 22)" IsChecked="True" Foreground="#f8fafc" FontSize="12" Margin="0,6"/>
                        <TextBlock Text="Opens necessary local ports for companion agent and LAN relays." FontSize="10" Foreground="#64748b" Margin="24,0,0,8"/>

                        <CheckBox Name="OptService" Content="Register 24/7 Background Service in Task Scheduler" IsChecked="True" Foreground="#f8fafc" FontSize="12" Margin="0,6"/>
                        <TextBlock Text="Runs automatically on system startup under NT AUTHORITY\SYSTEM." FontSize="10" Foreground="#64748b" Margin="24,0,0,0"/>
                    </StackPanel>
                </Border>
            </StackPanel>

            <!-- PAGE 3: PROGRESS -->
            <StackPanel Name="Page3" Visibility="Collapsed" VerticalAlignment="Center">
                <TextBlock Text="Installing Components..." FontSize="18" FontWeight="Bold" Foreground="#ffffff" Margin="0,0,0,8"/>
                <TextBlock Name="ProgressStatus" Text="Initializing installation..." FontSize="12" Foreground="#38bdf8" Margin="0,0,0,16"/>

                <ProgressBar Name="InstallProgress" Height="10" Background="#1e293b" Foreground="#0284c7" Value="10" Maximum="100" Margin="0,0,0,12"/>
                <TextBlock Name="ProgressDetail" Text="Please wait while services are configured..." FontSize="11" Foreground="#64748b"/>
            </StackPanel>

            <!-- PAGE 4: FINISH -->
            <StackPanel Name="Page4" Visibility="Collapsed">
                <TextBlock Text="🎉 Installation Completed!" FontSize="20" FontWeight="Bold" Foreground="#4ade80" Margin="0,0,0,4"/>
                <TextBlock Text="Nexus PC Command Center is now active and broadcasting." FontSize="12" Foreground="#cbd5e1" Margin="0,0,0,16"/>

                <!-- 6-DIGIT PIN HIGHLIGHT BOX -->
                <Border Background="#0f172a" BorderBrush="#0284c7" BorderThickness="1.5" CornerRadius="12" Padding="16" Margin="0,0,0,16">
                    <StackPanel HorizontalAlignment="Center">
                        <TextBlock Text="YOUR 6-DIGIT PAIRING PIN" FontSize="11" FontWeight="Bold" Foreground="#38bdf8" HorizontalAlignment="Center" Margin="0,0,0,6"/>
                        <TextBlock Name="PinDisplay" Text="LOADING..." FontSize="32" FontWeight="Black" Foreground="#38bdf8" HorizontalAlignment="Center" Margin="0,0,0,8"/>
                        <TextBlock Text="Enter this PIN on your Phone Dashboard &amp; Home Satellite Relay." FontSize="11" Foreground="#94a3b8" HorizontalAlignment="Center"/>
                    </StackPanel>
                </Border>

                <Button Name="BtnOpenDashboard" Content="🌐 Open Dashboard in Browser" Background="#0284c7" Foreground="#080c16" Height="38" FontSize="12" FontWeight="Bold" Margin="0,0,0,8"/>
            </StackPanel>

        </Grid>

        <!-- FOOTER NAVIGATION BAR -->
        <Border Grid.Row="2" Background="#111728" BorderBrush="#1e293b" BorderThickness="0,1,0,0" Padding="20,12">
            <Grid>
                <TextBlock Text="Nexus v3.0 Standard" FontSize="11" Foreground="#475569" VerticalAlignment="Center"/>
                <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
                    <Button Name="BtnBack" Content="&lt; Back" Width="90" Margin="0,0,8,0" Visibility="Collapsed"/>
                    <Button Name="BtnNext" Content="Next &gt;" Background="#0284c7" Foreground="#080c16" Width="90"/>
                    <Button Name="BtnFinish" Content="Finish" Background="#22c55e" Foreground="#080c16" Width="90" Visibility="Collapsed"/>
                </StackPanel>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

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

        # Execute Installation in background
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

                $scriptDir = Split-Path -Parent $PSCommandPath
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
            Start-Sleep -Milliseconds 1200

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

$window.ShowDialog() | Out-Null
