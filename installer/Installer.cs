using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Principal;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Nexus.Installer
{
    public class CustomWebClient : WebClient
    {
        public int Timeout { get; set; }
        public CustomWebClient(int timeout = 3000) { Timeout = timeout; }
        protected override WebRequest GetWebRequest(Uri uri)
        {
            var w = base.GetWebRequest(uri);
            if (w != null) w.Timeout = Timeout;
            return w;
        }
    }

    public class MainWindow : Window
    {
        private int currentStep = 1;
        private string pairCodeResult = "";
        private string localIpResult = "127.0.0.1";
        private bool isInstalled = false;

        // UI Pages
        private StackPanel pageMaintenance;
        private StackPanel page1Welcome;
        private StackPanel page2Options;
        private StackPanel page3Progress;
        private StackPanel page4Finish;
        private StackPanel page5UninstallSuccess;

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
        private TextBlock ipDisplay;
        private Button btnCopyPin;

        // Maintenance Controls
        private TextBlock txtExistingPin;
        private TextBlock txtExistingPath;

        public MainWindow()
        {
            Title = "Nexus PC Command Center Setup";
            Width = 640;
            Height = 540;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            ResizeMode = ResizeMode.NoResize;
            Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0c101c"));
            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f8fafc"));
            FontFamily = new FontFamily("Segoe UI");

            BuildUI();
            DetectInstallation();
        }

        private void DetectInstallation()
        {
            string programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            string targetDir = Path.Combine(programData, "NexusAgent", "agent");
            string serverJs = Path.Combine(targetDir, "server.js");
            string pairingJson = Path.Combine(targetDir, "pairing.json");

            if (File.Exists(serverJs) || Directory.Exists(targetDir))
            {
                isInstalled = true;
                if (File.Exists(pairingJson))
                {
                    try
                    {
                        string json = File.ReadAllText(pairingJson);
                        string p = ExtractJsonField(json, "pairCode");
                        if (!string.IsNullOrEmpty(p)) pairCodeResult = p;
                    }
                    catch { }
                }

                // Also try local API
                try
                {
                    using (var client = new CustomWebClient(1500))
                    {
                        client.Timeout = 1000;
                        var json = client.DownloadString("http://localhost:48880/api/pairing");
                        string p = ExtractJsonField(json, "pairCode");
                        string ip = ExtractJsonField(json, "localIp");
                        if (!string.IsNullOrEmpty(p)) pairCodeResult = p;
                        if (!string.IsNullOrEmpty(ip)) localIpResult = ip;
                    }
                }
                catch { }

                ShowMaintenancePage();
            }
            else
            {
                ShowWelcomePage();
            }
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
                Text = "Nexus PC Setup & Maintenance Wizard",
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8"))
            });
            headerTextStack.Children.Add(new TextBlock
            {
                Text = "Universal Remote Power, Security & Telemetry Companion",
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
            var bodyGrid = new Grid { Margin = new Thickness(24, 16, 24, 12) };

            // ==========================================
            // PAGE: MAINTENANCE (Existing Installation)
            // ==========================================
            pageMaintenance = new StackPanel { Visibility = Visibility.Collapsed };
            pageMaintenance.Children.Add(new TextBlock
            {
                Text = "Nexus PC Agent Already Installed",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 4)
            });
            pageMaintenance.Children.Add(new TextBlock
            {
                Text = "An active installation was detected on this PC. Select an action below:",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                Margin = new Thickness(0, 0, 0, 12)
            });

            // Info Card
            var infoBox = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#131c31")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e293b")),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(14),
                Margin = new Thickness(0, 0, 0, 14)
            };
            var infoStack = new StackPanel();
            txtExistingPin = new TextBlock
            {
                Text = "🔑 Current Pairing PIN: " + pairCodeResult,
                FontWeight = FontWeights.Bold,
                FontSize = 13,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8"))
            };
            txtExistingPath = new TextBlock
            {
                Text = "📁 Location: C:\\ProgramData\\NexusAgent\\agent (SYSTEM Service)",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                Margin = new Thickness(0, 4, 0, 0)
            };
            infoStack.Children.Add(txtExistingPin);
            infoStack.Children.Add(txtExistingPath);
            infoBox.Child = infoStack;
            pageMaintenance.Children.Add(infoBox);

            // Action Buttons
            var btnReinstall = CreateActionCard("🔄 Update / Reinstall Agent", "Upgrades code and session engine to latest version while preserving your PIN.", "#0284c7");
            btnReinstall.Click += async (s, e) =>
            {
                ShowProgressPage("Updating Nexus PC Agent...", "Replacing files and restarting background service...");
                await PerformInstallationAsync();
            };
            pageMaintenance.Children.Add(btnReinstall);

            var btnResetPin = CreateActionCard("🔑 Change / Reset 6-Digit PIN", "Generates a brand new random pairing PIN for phone linking.", "#0d9488");
            btnResetPin.Click += async (s, e) =>
            {
                ShowProgressPage("Resetting Pairing PIN...", "Generating a fresh 6-digit code for this machine...");
                await PerformResetPinAsync();
            };
            pageMaintenance.Children.Add(btnResetPin);

            var btnUninstall = CreateActionCard("🗑️ Completely Uninstall Agent", "Removes all background services, firewall rules, and files from this PC.", "#dc2626");
            btnUninstall.Click += async (s, e) =>
            {
                var res = MessageBox.Show(
                    "Are you sure you want to completely uninstall Nexus PC Agent from this computer?",
                    "Confirm Uninstallation",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Warning
                );
                if (res == MessageBoxResult.Yes)
                {
                    ShowProgressPage("Uninstalling Agent...", "Removing Task Scheduler service, firewall rules, and files...");
                    await PerformUninstallAsync();
                }
            };
            pageMaintenance.Children.Add(btnUninstall);

            bodyGrid.Children.Add(pageMaintenance);

            // ==========================================
            // PAGE 1: WELCOME (Fresh Install)
            // ==========================================
            page1Welcome = new StackPanel { Visibility = Visibility.Collapsed };
            page1Welcome.Children.Add(new TextBlock
            {
                Text = "Welcome to Nexus PC Command Center",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 6)
            });
            page1Welcome.Children.Add(new TextBlock
            {
                Text = "This setup wizard will configure your PC for remote power management, Wake-on-LAN, and secure lock screen bypass.",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                TextWrapping = TextWrapping.Wrap,
                LineHeight = 18,
                Margin = new Thickness(0, 0, 0, 14)
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
            page1Welcome.Children.Add(p1Box);

            page1Welcome.Children.Add(new TextBlock
            {
                Text = "Click 'Next' to customize options or proceed with installation.",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b")),
                Margin = new Thickness(0, 4, 0, 0)
            });
            bodyGrid.Children.Add(page1Welcome);

            // ==========================================
            // PAGE 2: OPTIONS
            // ==========================================
            page2Options = new StackPanel { Visibility = Visibility.Collapsed };
            page2Options.Children.Add(new TextBlock
            {
                Text = "Installation Options",
                FontSize = 18,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Margin = new Thickness(0, 0, 0, 6)
            });
            page2Options.Children.Add(new TextBlock
            {
                Text = "Select the components you want to enable on this machine:",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                Margin = new Thickness(0, 0, 0, 14)
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
            page2Options.Children.Add(p2Box);
            bodyGrid.Children.Add(page2Options);

            // ==========================================
            // PAGE 3: PROGRESS
            // ==========================================
            page3Progress = new StackPanel { Visibility = Visibility.Collapsed, VerticalAlignment = VerticalAlignment.Center };
            page3Progress.Children.Add(new TextBlock
            {
                Text = "Applying Changes...",
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
                Value = 15,
                Maximum = 100,
                Margin = new Thickness(0, 0, 0, 12)
            };
            progressDetail = new TextBlock
            {
                Text = "Please wait while services are configured...",
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#64748b"))
            };
            page3Progress.Children.Add(progressStatus);
            page3Progress.Children.Add(installProgress);
            page3Progress.Children.Add(progressDetail);
            bodyGrid.Children.Add(page3Progress);

            // ==========================================
            // PAGE 4: FINISH & PIN DISPLAY
            // ==========================================
            page4Finish = new StackPanel { Visibility = Visibility.Collapsed };
            page4Finish.Children.Add(new TextBlock
            {
                Text = "🎉 Nexus PC Agent is Active!",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#4ade80")),
                Margin = new Thickness(0, 0, 0, 4)
            });
            page4Finish.Children.Add(new TextBlock
            {
                Text = "Your PC companion service is running in the background and ready to pair.",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                Margin = new Thickness(0, 0, 0, 14)
            });

            var pinBox = new Border
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0f172a")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#0284c7")),
                BorderThickness = new Thickness(2),
                CornerRadius = new CornerRadius(14),
                Padding = new Thickness(20, 16, 20, 16),
                Margin = new Thickness(0, 0, 0, 14)
            };
            var pinStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
            pinStack.Children.Add(new TextBlock
            {
                Text = "🔑 YOUR 6-DIGIT PAIRING PIN",
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8")),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 8)
            });

            var pinRow = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 10) };
            pinDisplay = new TextBlock
            {
                Text = pairCodeResult,
                FontSize = 36,
                FontWeight = FontWeights.Black,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8")),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 16, 0)
            };
            btnCopyPin = CreateButton("📋 Copy PIN", "#0284c7", "#080c16", 36, 110);
            btnCopyPin.Click += (s, e) =>
            {
                try
                {
                    Clipboard.SetText(pairCodeResult);
                    btnCopyPin.Content = "✓ Copied!";
                }
                catch { }
            };
            pinRow.Children.Add(pinDisplay);
            pinRow.Children.Add(btnCopyPin);
            pinStack.Children.Add(pinRow);

            ipDisplay = new TextBlock
            {
                Text = string.Format("Local IP: {0} • Port: 48880 • Auto-starts with Windows", localIpResult),
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                HorizontalAlignment = HorizontalAlignment.Center
            };
            pinStack.Children.Add(ipDisplay);
            pinBox.Child = pinStack;
            page4Finish.Children.Add(pinBox);

            var btnOpenDash = CreateButton("🌐 Open Web Dashboard (Auto-Paired)", "#0284c7", "#080c16", 40);
            btnOpenDash.Click += (s, e) => Process.Start(new ProcessStartInfo(string.Format("https://nexus.hajimammad.com/#pair={0}", pairCodeResult)) { UseShellExecute = true });
            page4Finish.Children.Add(btnOpenDash);
            bodyGrid.Children.Add(page4Finish);

            // ==========================================
            // PAGE 5: UNINSTALL SUCCESS
            // ==========================================
            page5UninstallSuccess = new StackPanel { Visibility = Visibility.Collapsed, VerticalAlignment = VerticalAlignment.Center };
            page5UninstallSuccess.Children.Add(new TextBlock
            {
                Text = "🗑️ Uninstalled Successfully",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#ef4444")),
                Margin = new Thickness(0, 0, 0, 6)
            });
            page5UninstallSuccess.Children.Add(new TextBlock
            {
                Text = "Nexus PC Agent has been completely removed from this computer.\nAll background services, scheduled tasks, firewall rules, and files have been cleaned.",
                FontSize = 12,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#cbd5e1")),
                LineHeight = 18,
                Margin = new Thickness(0, 0, 0, 16)
            });
            var btnDoneUninstall = CreateButton("Close Wizard", "#334155", "#f8fafc", 38, 140);
            btnDoneUninstall.Click += (s, e) => Close();
            page5UninstallSuccess.Children.Add(btnDoneUninstall);
            bodyGrid.Children.Add(page5UninstallSuccess);

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
                Text = "Nexus v3.9.9 Native",
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

            btnFinish = CreateButton("Close", "#22c55e", "#080c16", 34, 90);
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

        private void ShowMaintenancePage()
        {
            HideAllPages();
            pageMaintenance.Visibility = Visibility.Visible;
            btnBack.Visibility = Visibility.Collapsed;
            btnNext.Visibility = Visibility.Collapsed;
            btnFinish.Visibility = Visibility.Collapsed;
            txtExistingPin.Text = "🔑 Current Pairing PIN: " + pairCodeResult;
        }

        private void ShowWelcomePage()
        {
            HideAllPages();
            currentStep = 1;
            page1Welcome.Visibility = Visibility.Visible;
            btnBack.Visibility = Visibility.Collapsed;
            btnNext.Visibility = Visibility.Visible;
            btnNext.Content = "Next >";
            btnFinish.Visibility = Visibility.Collapsed;
        }

        private void ShowProgressPage(string status, string detail)
        {
            HideAllPages();
            page3Progress.Visibility = Visibility.Visible;
            progressStatus.Text = status;
            progressDetail.Text = detail;
            installProgress.Value = 20;
            btnBack.Visibility = Visibility.Collapsed;
            btnNext.Visibility = Visibility.Collapsed;
            btnFinish.Visibility = Visibility.Collapsed;
        }

        private void ShowFinishPage()
        {
            HideAllPages();
            page4Finish.Visibility = Visibility.Visible;
            btnBack.Visibility = Visibility.Collapsed;
            btnNext.Visibility = Visibility.Collapsed;
            btnFinish.Visibility = Visibility.Visible;

            pinDisplay.Text = pairCodeResult;
            ipDisplay.Text = string.Format("Local IP: {0} • Port: 48880 • Auto-starts with Windows", localIpResult);

            try
            {
                Clipboard.SetText(pairCodeResult);
            }
            catch { }
        }

        private void ShowUninstallSuccessPage()
        {
            HideAllPages();
            page5UninstallSuccess.Visibility = Visibility.Visible;
            btnBack.Visibility = Visibility.Collapsed;
            btnNext.Visibility = Visibility.Collapsed;
            btnFinish.Visibility = Visibility.Collapsed;
        }

        private void HideAllPages()
        {
            if (pageMaintenance != null) pageMaintenance.Visibility = Visibility.Collapsed;
            if (page1Welcome != null) page1Welcome.Visibility = Visibility.Collapsed;
            if (page2Options != null) page2Options.Visibility = Visibility.Collapsed;
            if (page3Progress != null) page3Progress.Visibility = Visibility.Collapsed;
            if (page4Finish != null) page4Finish.Visibility = Visibility.Collapsed;
            if (page5UninstallSuccess != null) page5UninstallSuccess.Visibility = Visibility.Collapsed;
        }

        private Button CreateActionCard(string title, string subtitle, string accentColorHex)
        {
            var btn = new Button
            {
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#111827")),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1f2937")),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 0, 8),
                Padding = new Thickness(14, 10, 14, 10),
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalContentAlignment = HorizontalAlignment.Stretch
            };

            var stack = new StackPanel();
            stack.Children.Add(new TextBlock
            {
                Text = title,
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(accentColorHex))
            });
            stack.Children.Add(new TextBlock
            {
                Text = subtitle,
                FontSize = 11,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#94a3b8")),
                Margin = new Thickness(0, 2, 0, 0)
            });

            btn.Content = stack;
            return btn;
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
                page2Options.Visibility = Visibility.Collapsed;
                page1Welcome.Visibility = Visibility.Visible;
                btnBack.Visibility = Visibility.Collapsed;
                btnNext.Content = "Next >";
            }
        }

        private async void BtnNext_Click(object sender, RoutedEventArgs e)
        {
            if (currentStep == 1)
            {
                currentStep = 2;
                page1Welcome.Visibility = Visibility.Collapsed;
                page2Options.Visibility = Visibility.Visible;
                btnBack.Visibility = Visibility.Visible;
                btnNext.Content = "Install >";
            }
            else if (currentStep == 2)
            {
                ShowProgressPage("Installing Components...", "Please wait while services are configured...");
                await PerformInstallationAsync();
            }
        }

        private async Task PerformInstallationAsync()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string agentDir = Path.Combine(appDir, "agent");

            // Step 1: OpenSSH
            if (optOpenSSH == null || optOpenSSH.IsChecked == true)
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
            if (optFirewall == null || optFirewall.IsChecked == true)
            {
                progressStatus.Text = "Configuring Windows Firewall...";
                progressDetail.Text = "Opening inbound ports 48880 and 22 for local communication...";
                installProgress.Value = 60;

                await Task.Run(new Action(() =>
                {
                    RunPowerShell(
                        "if (-not (Get-NetFirewallRule -Name 'NexusAgentPort' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'NexusAgentPort' -DisplayName 'Nexus PC Agent (Port 48880)' -Direction Inbound -Protocol TCP -LocalPort 48880 -Profile Domain,Private -Action Allow -ErrorAction SilentlyContinue | Out-Null; } " +
                        "if (-not (Get-NetFirewallRule -Name 'NexusOpenSSH' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name 'NexusOpenSSH' -DisplayName 'OpenSSH Server (Port 22)' -Direction Inbound -Protocol TCP -LocalPort 22 -Profile Domain,Private -Action Allow -ErrorAction SilentlyContinue | Out-Null; }"
                    );
                }));
            }

            // Step 3: Register Task Scheduler Service
            if (optService == null || optService.IsChecked == true)
            {
                progressStatus.Text = "Registering 24/7 Background Service...";
                progressDetail.Text = "Installing files to ProgramData and registering Scheduled Task...";
                installProgress.Value = 85;

                await Task.Run(new Action(() =>
                {
                    string targetBaseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NexusAgent");
                    string targetAgentDir = Path.Combine(targetBaseDir, "agent");

                    // Stop current task cleanly if updating
                    RunPowerShell("Stop-ScheduledTask -TaskName 'NexusPCAgent' -ErrorAction SilentlyContinue; Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue;");

                    try
                    {
                        if (!Directory.Exists(targetAgentDir)) Directory.CreateDirectory(targetAgentDir);

                        // Backup credentials if present
                        string envFile = Path.Combine(targetAgentDir, ".env");
                        string pairFile = Path.Combine(targetAgentDir, "pairing.json");
                        string envBackup = File.Exists(envFile) ? File.ReadAllText(envFile) : null;
                        string pairBackup = File.Exists(pairFile) ? File.ReadAllText(pairFile) : null;

                        if (Directory.Exists(agentDir))
                        {
                            foreach (string dirPath in Directory.GetDirectories(agentDir, "*", SearchOption.AllDirectories))
                            {
                                Directory.CreateDirectory(dirPath.Replace(agentDir, targetAgentDir));
                            }
                            foreach (string newPath in Directory.GetFiles(agentDir, "*.*", SearchOption.AllDirectories))
                            {
                                File.Copy(newPath, newPath.Replace(agentDir, targetAgentDir), true);
                            }
                        }

                        // Restore credentials or generate fresh random PIN
                        if (envBackup != null) File.WriteAllText(envFile, envBackup);
                        if (pairBackup != null)
                        {
                            File.WriteAllText(pairFile, pairBackup);
                            pairCodeResult = ExtractJsonField(pairBackup, "pairCode");
                        }
                        else
                        {
                            string freshPin = new Random().Next(100000, 999999).ToString();
                            string freshJson = string.Format("{{\n  \"pairCode\": \"{0}\",\n  \"roomId\": \"room_{0}_pc\",\n  \"token\": \"token_{0}\",\n  \"updatedAt\": \"{1}\"\n}}", freshPin, DateTime.UtcNow.ToString("o"));
                            File.WriteAllText(pairFile, freshJson);
                            pairCodeResult = freshPin;

                            // Instant cloud pre-registration so pairing works immediately
                            try
                            {
                                using (var client = new CustomWebClient(4000))
                                {
                                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                                    client.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus-Agent/3.8.6";
                                    string regBody = string.Format("{{\"pairCode\":\"{0}\",\"roomId\":\"room_{0}_pc\",\"token\":\"token_{0}\",\"hostname\":\"{1}\",\"pcName\":\"{1}\"}}", freshPin, Environment.MachineName);
                                    client.UploadString("https://nexus.hajimammad.com/api/pair/register", regBody);
                                }
                            }
                            catch { }
                        }
                    }
                    catch { }

                    string serverJs = Path.Combine(targetAgentDir, "server.js").Replace("'", "''");
                    string safeAgentDir = targetAgentDir.Replace("'", "''");
                    string psCmd = string.Format(
                        "$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue; " +
                        "$nodePath = if ($nodeCmd) {{ $nodeCmd.Source }} else {{ 'C:\\Program Files\\nodejs\\node.exe' }}; " +
                        "if (-not (Test-Path $nodePath)) {{ winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements; $nodePath = 'C:\\Program Files\\nodejs\\node.exe'; }} " +
                        "if (Test-Path '{0}') {{ " +
                        "$action = New-ScheduledTaskAction -Execute $nodePath -Argument '{0}' -WorkingDirectory '{1}'; " +
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

            // Step 4: Finalize and Poll 6-Digit PIN
            installProgress.Value = 100;
            progressStatus.Text = "Querying Live 6-Digit Pairing PIN...";
            progressDetail.Text = "Connecting to local companion daemon...";

            for (int i = 0; i < 10; i++)
            {
                await Task.Delay(1000);
                try
                {
                    using (var client = new CustomWebClient(1500))
                    {
                        client.Timeout = 1500;
                        var json = client.DownloadString("http://localhost:48880/api/pairing");
                        if (json.Contains("\"pairCode\""))
                        {
                            var pCode = ExtractJsonField(json, "pairCode");
                            var ip = ExtractJsonField(json, "localIp");
                            if (!string.IsNullOrEmpty(pCode))
                            {
                                pairCodeResult = pCode;
                                if (!string.IsNullOrEmpty(ip)) localIpResult = ip;
                                break;
                            }
                        }
                    }
                }
                catch { }
            }

            ShowFinishPage();
        }

        private async Task PerformResetPinAsync()
        {
            installProgress.Value = 40;
            progressStatus.Text = "Regenerating Pairing PIN...";
            progressDetail.Text = "Requesting new 6-digit code from local companion daemon...";

            bool resetOk = false;
            try
            {
                using (var client = new CustomWebClient(2500))
                {
                    client.Headers[HttpRequestHeader.ContentType] = "application/json";
                    var res = client.UploadString("http://localhost:48880/api/pairing/reset", "{}");
                    var pCode = ExtractJsonField(res, "pairCode");
                    var ip = ExtractJsonField(res, "localIp");
                    if (!string.IsNullOrEmpty(pCode))
                    {
                        pairCodeResult = pCode;
                        if (!string.IsNullOrEmpty(ip)) localIpResult = ip;
                        resetOk = true;
                    }
                }
            }
            catch { }

            if (!resetOk)
            {
                await Task.Run(new Action(() =>
                {
                    string targetBaseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NexusAgent", "agent");
                    string pairFile = Path.Combine(targetBaseDir, "pairing.json");

                    RunPowerShell(
                        "Stop-ScheduledTask -TaskName 'NexusPCAgent' -ErrorAction SilentlyContinue; " +
                        "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; " +
                        (File.Exists(pairFile) ? "Remove-Item -Path '" + pairFile + "' -Force -ErrorAction SilentlyContinue; " : "") +
                        "Start-ScheduledTask -TaskName 'NexusPCAgent' -ErrorAction SilentlyContinue;"
                    );
                }));

                installProgress.Value = 80;
                progressStatus.Text = "Fetching New 6-Digit PIN...";
                progressDetail.Text = "Linking new PIN with Cloud Relay...";

                for (int i = 0; i < 10; i++)
                {
                    await Task.Delay(1000);
                    try
                    {
                        using (var client = new CustomWebClient(1500))
                        {
                            var json = client.DownloadString("http://localhost:48880/api/pairing");
                            if (json.Contains("\"pairCode\""))
                            {
                                var pCode = ExtractJsonField(json, "pairCode");
                                var ip = ExtractJsonField(json, "localIp");
                                if (!string.IsNullOrEmpty(pCode))
                                {
                                    pairCodeResult = pCode;
                                    if (!string.IsNullOrEmpty(ip)) localIpResult = ip;
                                    break;
                                }
                            }
                        }
                    }
                    catch { }
                }
            }

            installProgress.Value = 100;
            ShowFinishPage();
        }

        private async Task PerformUninstallAsync()
        {
            installProgress.Value = 30;
            progressStatus.Text = "Removing Background Services...";
            progressDetail.Text = "Stopping and unregistering Scheduled Task...";

            await Task.Run(new Action(() =>
            {
                RunPowerShell(
                    "Stop-ScheduledTask -TaskName 'NexusPCAgent' -ErrorAction SilentlyContinue; " +
                    "schtasks /Delete /TN 'NexusPCAgent' /F 2>$null; " +
                    "Unregister-ScheduledTask -TaskName 'NexusPCAgent' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null; " +
                    "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; " +
                    "$userStartup = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'; " +
                    "Get-ChildItem $userStartup -Filter '*nexus*' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue; " +
                    "$allStartup = Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'; " +
                    "Get-ChildItem $allStartup -Filter '*nexus*' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue; " +
                    "Remove-NetFirewallRule -Name 'NexusAgentPort' -ErrorAction SilentlyContinue | Out-Null; " +
                    "Remove-NetFirewallRule -Name 'NexusOpenSSH' -ErrorAction SilentlyContinue | Out-Null; " +
                    "$targetBaseDir = Join-Path $env:ProgramData 'NexusAgent'; " +
                    "if (Test-Path $targetBaseDir) { Remove-Item -Path $targetBaseDir -Recurse -Force -ErrorAction SilentlyContinue; }"
                );
            }));

            installProgress.Value = 100;
            ShowUninstallSuccessPage();
        }

        private string ExtractJsonField(string json, string field)
        {
            if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(field)) return "";
            try
            {
                var match = System.Text.RegularExpressions.Regex.Match(json, "\"" + field + "\"\\s*:\\s*\"([^\"]+)\"");
                if (match.Success)
                {
                    return match.Groups[1].Value;
                }
            }
            catch { }
            return "";
        }

        private void RunPowerShell(string script)
        {
            try
            {
                byte[] bytes = System.Text.Encoding.Unicode.GetBytes(script);
                string base64 = Convert.ToBase64String(bytes);
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand " + base64,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                var p = Process.Start(psi);
                if (p != null) p.WaitForExit(30000);
            }
            catch { }
        }

        private static bool IsAdministrator()
        {
            var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }

        [STAThread]
        public static void Main()
        {
            if (!IsAdministrator())
            {
                try
                {
                    var exePath = Process.GetCurrentProcess().MainModule.FileName;
                    var startInfo = new ProcessStartInfo(exePath)
                    {
                        UseShellExecute = true,
                        Verb = "runas"
                    };
                    Process.Start(startInfo);
                    return;
                }
                catch { }
            }

            var app = new Application();
            app.Run(new MainWindow());
        }
    }
}
