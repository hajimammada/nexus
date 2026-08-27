using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Nexus.Installer
{
    public class MainWindow : Window
    {
        private int currentStep = 1;
        private string pairCodeResult = "READY";
        private string dashboardUrl = "https://nexus.hajimammad.com";

        // UI Pages
        private StackPanel page1;
        private StackPanel page2;
        private StackPanel page3;
        private StackPanel page4;

        // Navigation
        private Button btnBack;
        private Button btnNext;
        private Button btnFinish;

        // Options
        private CheckBox optOpenSSH;
        private CheckBox optFirewall;
        private CheckBox optService;

        // Progress Controls
        private TextBlock progressStatus;
        private TextBlock progressDetail;
        private ProgressBar installProgress;

        // Finish Controls
        private TextBlock pinDisplay;

        public MainWindow()
        {
            Title = "Nexus PC Command Center Setup";
            Width = 620;
            Height = 500;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.NoResize;
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0c101c"));
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f8fafc"));
            FontFamily = new FontFamily("Segoe UI");

            BuildUI();
        }

        private void BuildUI()
        {
            var mainGrid = new Grid();
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(72) });
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(65) });

            // 1. HEADER BAR
            var headerBorder = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#111728")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b")),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(24, 12, 24, 12)
            };
            var headerGrid = new Grid();
            var headerTextStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            headerTextStack.Children.Add(new TextBlock
            {
                Text = "Nexus PC Setup Wizard",
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8"))
            });
            headerTextStack.Children.Add(new TextBlock
            {
                Text = "Universal Remote Power, Security & Telemetry Setup",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                Margin = new Thickness(0, 2, 0, 0)
            });

            var headerIcon = new Border
            {
                HorizontalAlignment = HorizontalAlignment.Right,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0284c7")),
                CornerRadius = new CornerRadius(12),
                Width = 38,
                Height = 38,
                Child = new TextBlock
                {
                    Text = "⚡",
                    FontSize = 18,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                }
            };
            headerGrid.Children.Add(headerTextStack);
            headerGrid.Children.Add(headerIcon);
            headerBorder.Child = headerGrid;
            Grid.SetRow(headerBorder, 0);
            mainGrid.Children.Add(headerBorder);

            // 2. BODY CONTENT
            var bodyGrid = new Grid { Margin = new Thickness(24, 20, 24, 16) };

            // PAGE 1: WELCOME
            page1 = new StackPanel { Visibility = Visibility.Visible };
            page1.Children.Add(new TextBlock
            {
                Text = "Welcome to Nexus PC Command Center",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 8)
            });
            page1.Children.Add(new TextBlock
            {
                Text = "This setup wizard will configure your PC for remote power management, Wake-on-LAN, and secure lock screen bypass.",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                TextWrapping = TextWrapping.Wrap,
                LineHeight = 18,
                Margin = new Thickness(0, 0, 0, 16)
            });

            var p1Box = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#131c31")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(16),
                Margin = new Thickness(0, 0, 0, 12)
            };
            var p1BoxStack = new StackPanel();
            p1BoxStack.Children.Add(new TextBlock
            {
                Text = "What will be configured on this PC:",
                FontWeight = FontWeights.Bold,
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8")),
                Margin = new Thickness(0, 0, 0, 8)
            });
            p1BoxStack.Children.Add(CreateBulletText("• Windows OpenSSH Server (for 1-click remote screen unlock)"));
            p1BoxStack.Children.Add(CreateBulletText("• Inbound Windows Firewall Rules (Ports 48880 & 22)"));
            p1BoxStack.Children.Add(CreateBulletText("• 24/7 Background Boot Service (Runs automatically as SYSTEM)"));
            p1BoxStack.Children.Add(CreateBulletText("• Outbound WebSocket Cloud Relay connection"));
            p1Box.Child = p1BoxStack;
            page1.Children.Add(p1Box);

            page1.Children.Add(new TextBlock
            {
                Text = "Click 'Next' to customize options or proceed with installation.",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b")),
                Margin = new Thickness(0, 4, 0, 0)
            });
            bodyGrid.Children.Add(page1);

            // PAGE 2: OPTIONS
            page2 = new StackPanel { Visibility = Visibility.Collapsed };
            page2.Children.Add(new TextBlock
            {
                Text = "Installation Options",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 8)
            });
            page2.Children.Add(new TextBlock
            {
                Text = "Select the components you want to enable on this machine:",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                Margin = new Thickness(0, 0, 0, 16)
            });

            var p2Box = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#131c31")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(16)
            };
            var p2Stack = new StackPanel();

            optOpenSSH = new CheckBox { Content = "Enable Windows OpenSSH Server (Bypass Lock Screen)", IsChecked = true, Foreground = Brushes.White, FontSize = 12, Margin = new Thickness(0, 4, 0, 2) };
            var sub1 = new TextBlock { Text = "Allows remote unlocking of your Windows console session from your phone.", FontSize = 10, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b")), Margin = new Thickness(24, 0, 0, 10) };

            optFirewall = new CheckBox { Content = "Configure Windows Firewall Rules (Ports 48880 & 22)", IsChecked = true, Foreground = Brushes.White, FontSize = 12, Margin = new Thickness(0, 4, 0, 2) };
            var sub2 = new TextBlock { Text = "Opens necessary local ports for companion agent and LAN relays.", FontSize = 10, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b")), Margin = new Thickness(24, 0, 0, 10) };

            optService = new CheckBox { Content = "Register 24/7 Background Service in Task Scheduler", IsChecked = true, Foreground = Brushes.White, FontSize = 12, Margin = new Thickness(0, 4, 0, 2) };
            var sub3 = new TextBlock { Text = "Runs automatically on system startup under NT AUTHORITY\\SYSTEM.", FontSize = 10, Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b")), Margin = new Thickness(24, 0, 0, 4) };

            p2Stack.Children.Add(optOpenSSH);
            p2Stack.Children.Add(sub1);
            p2Stack.Children.Add(optFirewall);
            p2Stack.Children.Add(sub2);
            p2Stack.Children.Add(optService);
            p2Stack.Children.Add(sub3);
            p2Box.Child = p2Stack;
            page2.Children.Add(p2Box);
            bodyGrid.Children.Add(page2);

            // PAGE 3: PROGRESS
            page3 = new StackPanel { Visibility = Visibility.Collapsed, VerticalAlignment = VerticalAlignment.Center };
            page3.Children.Add(new TextBlock
            {
                Text = "Installing Components...",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 8)
            });
            progressStatus = new TextBlock
            {
                Text = "Initializing installation...",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8")),
                Margin = new Thickness(0, 0, 0, 14)
            };
            installProgress = new ProgressBar
            {
                Height = 10,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b")),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0284c7")),
                Value = 10,
                Maximum = 100,
                Margin = new Thickness(0, 0, 0, 12)
            };
            progressDetail = new TextBlock
            {
                Text = "Please wait while services are configured...",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b"))
            };
            page3.Children.Add(progressStatus);
            page3.Children.Add(installProgress);
            page3.Children.Add(progressDetail);
            bodyGrid.Children.Add(page3);

            // PAGE 4: FINISH
            page4 = new StackPanel { Visibility = Visibility.Collapsed };
            page4.Children.Add(new TextBlock
            {
                Text = "🎉 Installation Completed!",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#4ade80")),
                Margin = new Thickness(0, 0, 0, 4)
            });
            page4.Children.Add(new TextBlock
            {
                Text = "Nexus PC Command Center is now active and broadcasting.",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                Margin = new Thickness(0, 0, 0, 16)
            });

            var pinBox = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0f172a")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0284c7")),
                BorderThickness = new Thickness(1.5),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(16),
                Margin = new Thickness(0, 0, 0, 16)
            };
            var pinStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            pinStack.Children.Add(new TextBlock
            {
                Text = "YOUR 6-DIGIT PAIRING PIN",
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8")),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 6)
            });
            pinDisplay = new TextBlock
            {
                Text = "LOADING...",
                FontSize = 32,
                FontWeight = FontWeights.Black,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8")),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 8)
            };
            pinStack.Children.Add(pinDisplay);
            pinStack.Children.Add(new TextBlock
            {
                Text = "Enter this PIN on your Phone Dashboard & Satellite App.",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                HorizontalAlignment = HorizontalAlignment.Center
            });
            pinBox.Child = pinStack;
            page4.Children.Add(pinBox);

            var btnOpenDash = CreateButton("🌐 Open Dashboard in Browser", "#0284c7", "#080c16", 40);
            btnOpenDash.Click += (s, e) => Process.Start(new ProcessStartInfo(dashboardUrl) { UseShellExecute = true });
            page4.Children.Add(btnOpenDash);
            bodyGrid.Children.Add(page4);

            Grid.SetRow(bodyGrid, 1);
            mainGrid.Children.Add(bodyGrid);

            // 3. FOOTER NAVIGATION BAR
            var footerBorder = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#111728")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b")),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(24, 12, 24, 12)
            };
            var footerGrid = new Grid();
            footerGrid.Children.Add(new TextBlock
            {
                Text = "Nexus v3.3.0 Native",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#475569")),
                VerticalAlignment = VerticalAlignment.Center
            });

            var navStack = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            btnBack = CreateButton("< Back", "#1e293b", "#f8fafc", 34, 90);
            btnBack.Visibility = Visibility.Collapsed;
            btnBack.Margin = new Thickness(0, 0, 8, 0);
            btnBack.Click += BtnBack_Click;

            btnNext = CreateButton("Next >", "#0284c7", "#080c16", 34, 90);
            btnNext.Click += BtnNext_Click;

            btnFinish = CreateButton("Finish", "#22c55e", "#080c16", 34, 90);
            btnFinish.Visibility = Visibility.Collapsed;
            btnFinish.Click += (s, e) => Close();

            navStack.Children.Add(btnBack);
            navStack.Children.Add(btnNext);
            navStack.Children.Add(btnFinish);
            footerGrid.Children.Add(navStack);

            footerBorder.Child = footerGrid;
            Grid.SetRow(footerBorder, 2);
            mainGrid.Children.Add(footerBorder);

            Content = mainGrid;
        }

        private TextBlock CreateBulletText(string text)
        {
            return new TextBlock
            {
                Text = text,
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                Margin = new Thickness(0, 2, 0, 2)
            };
        }

        private Button CreateButton(string text, string bgHex, string fgHex, double height, double width = double.NaN)
        {
            var btn = new Button
            {
                Content = text,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(bgHex)),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(fgHex)),
                Height = height,
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand
            };
            if (!double.IsNaN(width)) btn.Width = width;
            return btn;
        }

        private void BtnBack_Click(object sender, RoutedEventArgs e)
        {
            if (currentStep == 2)
            {
                currentStep = 1;
                page2.Visibility = Visibility.Collapsed;
                page1.Visibility = Visibility.Visible;
                btnBack.Visibility = Visibility.Collapsed;
                btnNext.Content = "Next >";
            }
        }

        private async void BtnNext_Click(object sender, RoutedEventArgs e)
        {
            if (currentStep == 1)
            {
                currentStep = 2;
                page1.Visibility = Visibility.Collapsed;
                page2.Visibility = Visibility.Visible;
                btnBack.Visibility = Visibility.Visible;
                btnNext.Content = "Install >";
            }
            else if (currentStep == 2)
            {
                currentStep = 3;
                page2.Visibility = Visibility.Collapsed;
                page3.Visibility = Visibility.Visible;
                btnBack.Visibility = Visibility.Collapsed;
                btnNext.Visibility = Visibility.Collapsed;

                await PerformInstallationAsync();
            }
        }

        private async Task PerformInstallationAsync()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string agentDir = Path.Combine(appDir, "agent");

            // Step 1: OpenSSH
            if (optOpenSSH.IsChecked == true)
            {
                progressStatus.Text = "Configuring OpenSSH Server...";
                progressDetail.Text = "Enabling native Windows remote session unlock...";
                installProgress.Value = 30;

                await Task.Run(new Action(() =>
                {
                    RunPowerShell(
                        "$sshCap = Get-WindowsCapability -Online -ErrorAction SilentlyContinue | Where-Object Name -like 'OpenSSH.Server*'; " +
                        "if ($sshCap -and $sshCap.State -ne 'Installed') { Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 -ErrorAction SilentlyContinue | Out-Null; } " +
                        "Start-Service sshd -ErrorAction SilentlyContinue; " +
                        "Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction SilentlyContinue;"
                    );
                }));
            }

            // Step 2: Firewall
            if (optFirewall.IsChecked == true)
            {
                progressStatus.Text = "Configuring Windows Firewall...";
                progressDetail.Text = "Opening inbound ports 48880 and 22 for local communication...";
                installProgress.Value = 60;

                await Task.Run(new Action(() =>
                {
                    RunPowerShell(
                        "if (-not (Get-NetFirewallRule -Name 'NexusAgentPort' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'NexusAgentPort' -DisplayName 'Nexus PC Agent (Port 48880)' -Direction Inbound -Protocol TCP -LocalPort 48880 -Action Allow -ErrorAction SilentlyContinue | Out-Null; } " +
                        "if (-not (Get-NetFirewallRule -Name 'NexusOpenSSH' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'NexusOpenSSH' -DisplayName 'OpenSSH Server (Port 22)' -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -ErrorAction SilentlyContinue | Out-Null; }"
                    );
                }));
            }

            // Step 3: Register Task Scheduler Service
            if (optService.IsChecked == true)
            {
                progressStatus.Text = "Registering 24/7 Background Service...";
                progressDetail.Text = "Creating Scheduled Task under NT AUTHORITY\\SYSTEM...";
                installProgress.Value = 85;

                await Task.Run(new Action(() =>
                {
                    string serverJs = Path.Combine(agentDir, "server.js").Replace("'", "''");
                    string safeAgentDir = agentDir.Replace("'", "''");
                    string psCmd = string.Format(
                        "$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue; " +
                        "$nodePath = if ($nodeCmd) {{ $nodeCmd.Source }} else {{ 'C:\\Program Files\\nodejs\\node.exe' }}; " +
                        "Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue; " +
                        "if (Test-Path '{0}') {{ " +
                        "$action = New-ScheduledTaskAction -Execute $nodePath -Argument '\"{0}\"' -WorkingDirectory '{1}'; " +
                        "$trigger = New-ScheduledTaskTrigger -AtStartup; " +
                        "$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; " +
                        "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365); " +
                        "Register-ScheduledTask -TaskName 'NexusPCAgent' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Nexus PC Companion Agent Boot Service' -Force -ErrorAction SilentlyContinue | Out-Null; " +
                        "Start-ScheduledTask -TaskName 'NexusPCAgent' -ErrorAction SilentlyContinue; }}",
                        serverJs, safeAgentDir
                    );
                    RunPowerShell(psCmd);
                }));
            }

            // Step 4: Finalize and Fetch 6-Digit PIN
            installProgress.Value = 100;
            progressStatus.Text = "Querying Live 6-Digit Pairing PIN...";
            progressDetail.Text = "Connecting to local companion daemon...";

            await Task.Delay(1500);

            try
            {
                using (var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) })
                {
                    var json = await client.GetStringAsync("http://localhost:48880/api/pairing");
                    if (json.Contains("\"pairCode\""))
                    {
                        var start = json.IndexOf("\"pairCode\":\"") + 12;
                        var end = json.IndexOf("\"", start);
                        if (start > 11 && end > start)
                        {
                            pairCodeResult = json.Substring(start, end - start);
                        }
                    }
                }
            }
            catch { }

            pinDisplay.Text = !string.IsNullOrEmpty(pairCodeResult) ? pairCodeResult : "ACTIVE";

            currentStep = 4;
            page3.Visibility = Visibility.Collapsed;
            page4.Visibility = Visibility.Visible;
            btnFinish.Visibility = Visibility.Visible;
        }

        private void RunPowerShell(string script)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = string.Format("-NoProfile -ExecutionPolicy Bypass -Command \"{0}\"", script),
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                var p = Process.Start(psi);
                if (p != null) p.WaitForExit(30000);
            }
            catch { }
        }

        [STAThread]
        public static void Main()
        {
            var app = new Application();
            app.Run(new MainWindow());
        }
    }
}
