# 🪐 Nexus PC Command Center — Remote Power & Telemetry Dashboard

A futuristic, high-performance web dashboard for comprehensive remote PC power management (MacroDroid Wake-on-LAN Power-ON, remote Sleep, Restart, Shutdown, Lock), real-time hardware performance telemetry, remote PowerShell terminal console, and one-click remote desktop access (Chrome Remote Desktop & Google Antigravity).

---

## ⚡ Key Capabilities

1. **⚡ Power-ON PC via MacroDroid Webhook**:
   - Dedicated action card to trigger your MacroDroid Wake-on-LAN webhook URL instantly.
   - Wakes up your PC, triggers smart plugs, or starts automated wake sequences from anywhere.

2. **🔒 Remote Sleep, Restart, Shut Down, Lock from Anywhere**:
   - Powered by a lightweight background Windows service (`NexusPCAgent`).
   - Supports local network and **Cloudflare Tunnels** (`setup-pc-tunnel.bat`) to safely manage your PC from your phone or laptop anywhere in the world.
   - Instant 1-click confirmation with zero countdown lag.

3. **💻 Built-in Remote PowerShell Terminal**:
   - Interactive CLI console directly inside the web browser.
   - Execute PowerShell scripts, inspect running processes, view system boot times, and query network configs with 1-tap presets.

4. **🖥️ Instant Remote Access Gateway**:
   - **Chrome Remote Desktop**: One-click connection to stream and control your PC desktop.
   - **Google Antigravity**: One-click launch to your agentic AI coding workspace.

5. **📊 Live Hardware Telemetry**:
   - Real-time CPU & RAM utilization bars and system uptime tracking.

---

## 🔌 Step 1: Configure MacroDroid Power-ON Webhook

1. On your phone, set up a **MacroDroid** macro with a **Webhook Trigger** (e.g. `Wake / Power ON PC`).
2. Copy the webhook URL provided by MacroDroid (`https://trigger.macrodroid.com/YOUR_DEVICE_ID/wake_my_pc`).
3. In your Nexus Dashboard, click the **Settings (⚙️)** button in the top-right corner.
4. Paste the URL into **"MacroDroid Power-ON Webhook URL"** and click **"Test Signal"**.
5. Click **"Save Settings"**. You can now turn on your PC with 1 click on the dashboard!

---

## 💻 Step 2: Run the PC Companion Agent

To enable remote Sleep, Restart, Shutdown, Terminal execution, and live CPU/RAM telemetry:

### Option A: Automatic Startup Service (Recommended)
Right-click `register-task.ps1` and select **Run with PowerShell (As Administrator)**.
*(Registers `NexusPCAgent` in Windows Task Scheduler to start automatically on Windows boot).*

### Option B: Local Network (Same WiFi / LAN)
Double-click:
```text
agent\start-agent.bat
```
*(Runs on `http://localhost:48880` with your configured `AGENT_KEY` in `agent/.env`)*

### Option C: Remote Access From Anywhere (Cloudflare Tunnel)
Follow the guide in:
```text
setup-pc-tunnel.bat
```

---

## 📂 Project Architecture

```text
nexus-dashboard/
├── agent/                         # PC Background Companion Daemon
│   ├── server.js                  # Power APIs (Sleep/Restart/Shutdown/Lock), Terminal & Telemetry
│   ├── tunnel.js                  # Automated Cloudflare Quick Tunnel provider
│   ├── start-agent.bat            # Local start script
│   └── start-agent-remote.bat     # Remote tunnel start script
│
├── client/                        # React + Vite + Tailwind Dashboard Source
│   ├── src/
│   │   ├── components/            # Header, PowerModal, TerminalModal, SettingsModal, Toast
│   │   ├── utils/api.js           # API client & local settings storage
│   └── vite.config.js             # Vite build configuration (outputs to ../dist)
│
├── dist/                          # Production built web assets
├── worker.js                      # Cloudflare Worker reverse-proxy & asset handler
└── register-task.ps1              # Windows Task Scheduler automated service installer
```
