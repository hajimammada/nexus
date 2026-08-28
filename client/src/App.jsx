import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Power, 
  Moon, 
  RotateCcw, 
  Lock, 
  Unlock, 
  Zap, 
  Monitor, 
  Bot, 
  Settings, 
  Cpu, 
  HardDrive, 
  ArrowUpRight, 
  Terminal, 
  Activity,
  Radio,
  Link2,
  CheckCircle2,
  Download
} from 'lucide-react';

import ConfirmPowerModal from './components/ConfirmPowerModal';
import SettingsModal from './components/SettingsModal';
import TerminalModal from './components/TerminalModal';
import PairModal from './components/PairModal';
import InstallWizardModal from './components/InstallWizardModal';
import Toast from './components/Toast';

import { 
  getStoredSettings, 
  saveStoredSettings, 
  fetchAgentStatus, 
  executePowerAction, 
  claimPairCode,
  RelayManager 
} from './utils/api';

const APP_VERSION = 'v3.8.6';

export default function App() {
  const [settings, setSettings] = useState(() => getStoredSettings());
  const [telemetry, setTelemetry] = useState(null);
  const [connectionState, setConnectionState] = useState({ online: false, source: 'none' });
  const [time, setTime] = useState(new Date());

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isPairOpen, setIsPairOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [powerActionModal, setPowerActionModal] = useState({ isOpen: false, action: null });

  // Toasts state
  const [toasts, setToasts] = useState([]);
  const relayManagerRef = useRef(null);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Live Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Real-Time Relay Manager
  useEffect(() => {
    const relay = new RelayManager({
      relayUrl: settings.relayUrl,
      roomId: settings.roomId,
      token: settings.token,
      onTelemetry: (data) => {
        setTelemetry(data);
        if (data && data.hostname) {
          setSettings(prev => {
            if (prev.hostname !== data.hostname) {
              const updated = { ...prev, hostname: data.hostname };
              saveStoredSettings(updated);
              return updated;
            }
            return prev;
          });
        }
      },
      onStateChange: (state) => {
        setConnectionState(state);
      },
      onActionResponse: (res) => {
        if (res.success) {
          addToast(res.message || `${res.action} completed!`, 'success');
        } else {
          addToast(res.error || `${res.action} failed.`, 'error');
        }
      }
    });

    relayManagerRef.current = relay;
    if (settings.roomId) {
      relay.connect();
    }

    return () => relay.disconnect();
  }, [settings.relayUrl, settings.roomId, settings.token, addToast]);

  // Check URL Hash for 1-Tap Pairing Link (#pair=482-190)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('pair=')) {
      const match = hash.match(/pair=([0-9a-zA-Z-]+)/);
      if (match && match[1]) {
        const code = match[1];
        addToast(`Discovered pairing PIN [${code}]. Linking...`, 'info');
        claimPairCode(code, settings.relayUrl)
          .then(data => {
            const updated = { ...settings, ...data, pairCode: code };
            setSettings(updated);
            saveStoredSettings(updated);
            addToast(`Successfully paired with ${data.hostname || 'PC'}!`, 'success');
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch(err => {
            addToast(`1-Tap Pairing error: ${err.message}`, 'error');
          });
      }
    }
  }, [settings, addToast]);

  // Dual-Channel Edge Relay & Local Status Polling (Zero-Fail Sync)
  const checkEdgeStatus = useCallback(async () => {
    const pairCode = settings.pairCode || (settings.roomId ? settings.roomId.split('_')[1] : null);
    if (!pairCode) return;

    try {
      const baseUrl = settings.relayUrl || 'https://nexus.hajimammad.com';
      const res = await fetch(`${baseUrl}/api/pair/status?code=${pairCode}`);
      if (res.ok) {
        const data = await res.json();
        if (data.online) {
          setConnectionState(prev => ({ ...prev, online: true, source: 'relay' }));
          if (data.telemetry) setTelemetry(data.telemetry);
          const realName = data.hostname || data.telemetry?.hostname;
          if (realName) {
            setSettings(prev => {
              if (prev.hostname !== realName || (!prev.targetMac && data.targetMac)) {
                const updated = { ...prev, hostname: realName, targetMac: data.targetMac || prev.targetMac, targetIp: data.targetIp || prev.targetIp };
                saveStoredSettings(updated);
                return updated;
              }
              return prev;
            });
          }
        }
      }
    } catch {}
  }, [settings.pairCode, settings.roomId, settings.relayUrl]);

  useEffect(() => {
    checkEdgeStatus();
    const interval = setInterval(checkEdgeStatus, 3000);
    return () => clearInterval(interval);
  }, [checkEdgeStatus]);

  // Fallback Local LAN Polling
  const checkLocalAgent = useCallback(async () => {
    if (!settings.agentUrl || connectionState.online) return;
    try {
      const res = await fetchAgentStatus(settings.agentUrl, settings.agentKey);
      if (res.online) {
        setConnectionState({ online: true, source: 'local' });
        setTelemetry(res);
      }
    } catch {}
  }, [settings.agentUrl, settings.agentKey, connectionState.online]);

  useEffect(() => {
    checkLocalAgent();
    const interval = setInterval(checkLocalAgent, 5000);
    return () => clearInterval(interval);
  }, [checkLocalAgent, settings.roomId, settings.agentUrl]);

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    saveStoredSettings(newSettings);
    if (relayManagerRef.current) {
      relayManagerRef.current.updateConfig(newSettings.relayUrl, newSettings.roomId, newSettings.token);
    }
  };

  const handlePaired = (pairedData) => {
    const updated = { ...settings, ...pairedData };
    setSettings(updated);
    saveStoredSettings(updated);
    addToast(`Successfully paired with ${pairedData.hostname || 'PC'}!`, 'success');
  };

  // Request Power Action
  const handleRequestPowerAction = (action) => {
    setPowerActionModal({ isOpen: true, action });
  };

  const handleConfirmPowerAction = async (action) => {
    try {
      addToast(`Dispatching ${action.toUpperCase()} command...`, 'info');
      const res = await executePowerAction(action, settings, relayManagerRef.current);
      addToast(res.message || `${action.toUpperCase()} signal sent!`, 'success');
    } catch (err) {
      addToast(err.message || `Failed to execute ${action}`, 'error');
    }
  };

  const handleDirectAction = async (action) => {
    try {
      addToast(`Triggering ${action.toUpperCase()}...`, 'info');
      const res = await executePowerAction(action, settings, relayManagerRef.current);
      addToast(res.message || `${action.toUpperCase()} sent!`, 'success');
    } catch (err) {
      addToast(err.message || `Failed to execute ${action}`, 'error');
    }
  };

  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const formattedDate = time.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const cpuPercent = telemetry?.cpuUsagePercent || 0;
  const ramPercent = telemetry?.ramUsagePercent || 0;
  const isPcOnline = connectionState.online;

  const remoteDesktopUrl = settings.remoteDesktopUrl || 'https://remotedesktop.google.com/access';
  const antigravityUrl = settings.antigravityUrl || 'https://antigravity.google.com';

  return (
    <div className="min-h-screen bg-[#080b12] text-slate-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Background ambient lighting */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Container */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col justify-center">
        
        {/* TOP HEADER & STATUS BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800/80">
          
          {/* Left: Brand & Status */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-violet-600 flex items-center justify-center p-0.5 shadow-xl shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all duration-300">
                <div className="w-full h-full bg-[#0d1322] rounded-[14px] flex items-center justify-center">
                  <Power className="w-7 h-7 text-cyan-400" />
                </div>
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPcOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-4 w-4 border-2 border-[#0d1322] ${isPcOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black tracking-tight text-white">
                  PC COMMAND CENTER
                </h1>
                <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-md">
                  {APP_VERSION}
                </span>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isPcOnline 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                  {isPcOnline 
                    ? (connectionState.source === 'relay' ? 'ONLINE (CLOUD RELAY)' : 'ONLINE (LOCAL LAN)')
                    : 'PC STANDBY / OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Target: <span className="text-slate-200 font-mono font-semibold">{settings.hostname || telemetry?.hostname || 'My-PC'}</span>
                {telemetry?.uptimeFormatted && (
                  <> • Uptime: <span className="text-cyan-300 font-mono">{telemetry.uptimeFormatted}</span></>
                )}
                {settings.pairCode && (
                  <> • Room PIN: <span className="text-amber-300 font-mono">{settings.pairCode}</span></>
                )}
              </p>
            </div>
          </div>

          {/* Right: Clock & Quick Actions */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="font-mono text-3xl font-bold tracking-wider text-slate-100 drop-shadow">
                {formattedTime}
              </div>
              <div className="text-[11px] font-medium text-slate-400">
                {formattedDate}
              </div>
            </div>

            {/* Download / Setup Wizard Button */}
            <button
              onClick={() => setIsWizardOpen(true)}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-500/15 to-blue-600/15 hover:from-cyan-500/25 hover:to-blue-600/25 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 transition-all duration-200 shadow-lg cursor-pointer flex items-center gap-2 text-xs font-bold"
              title="Download & Installation Wizard"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span className="hidden md:inline">Download & Setup</span>
            </button>

            {/* Pair PC Button */}
            <button
              onClick={() => setIsPairOpen(true)}
              className="p-3.5 rounded-2xl bg-[#111726] hover:bg-[#19233a] text-cyan-400 border border-cyan-500/30 hover:border-cyan-400 transition-all duration-200 shadow-lg cursor-pointer flex items-center gap-2 text-xs font-bold"
              title="Pair with 6-Digit PIN"
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden md:inline">{settings.roomId ? 'Paired' : 'Pair PC'}</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-3.5 rounded-2xl bg-[#111726] hover:bg-[#19233a] text-slate-300 hover:text-cyan-400 border border-slate-700/80 hover:border-cyan-500/40 transition-all duration-200 shadow-lg group cursor-pointer"
              title="Configure Settings"
            >
              <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
            </button>
          </div>

        </div>

        {/* SECTION 1: SYSTEM POWER MANAGEMENT (6 EQUAL-SIZED TILES) */}
        <div className="mb-8">
          
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              System Power & Security Management
            </h2>
            <span className="text-xs text-slate-500">
              Universal Remote Control (Before & After Unlock)
            </span>
          </div>

          {/* Equal-sized 6-button responsive grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            
            {/* 1. Turn ON (Wake-on-LAN) Tile */}
            <button
              onClick={() => handleDirectAction('wake')}
              className="relative p-5 rounded-3xl bg-[#111728]/95 hover:bg-emerald-950/60 border border-emerald-500/30 hover:border-emerald-500/60 shadow-lg text-left transition-all duration-200 group flex flex-col justify-between cursor-pointer min-h-[170px]"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                  <Power className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  WOL
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white text-base group-hover:text-emerald-300 transition-colors">
                  Turn ON PC
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Magic packet via Satellite
                </p>
              </div>
            </button>

            {/* 2. Unlock PC Tile */}
            <button
              onClick={() => handleDirectAction('unlock')}
              className="relative p-5 rounded-3xl bg-[#111728]/95 hover:bg-cyan-950/60 border border-cyan-500/30 hover:border-cyan-500/60 shadow-lg text-left transition-all duration-200 group flex flex-col justify-between cursor-pointer min-h-[170px]"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                  <Unlock className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                  SSH Unlock
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white text-base group-hover:text-cyan-300 transition-colors">
                  Unlock Screen
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Bypass Windows lock
                </p>
              </div>
            </button>

            {/* 3. Sleep PC Tile */}
            <button
              onClick={() => handleRequestPowerAction('sleep')}
              className="relative p-5 rounded-3xl bg-[#111728]/95 hover:bg-indigo-950/60 border border-indigo-500/30 hover:border-indigo-500/60 shadow-lg text-left transition-all duration-200 group flex flex-col justify-between cursor-pointer min-h-[170px]"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform">
                  <Moon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  Standby
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white text-base group-hover:text-indigo-300 transition-colors">
                  Sleep Mode
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Low-power ACPI sleep
                </p>
              </div>
            </button>

            {/* 4. Restart PC Tile */}
            <button
              onClick={() => handleRequestPowerAction('restart')}
              className="relative p-5 rounded-3xl bg-[#111728]/95 hover:bg-amber-950/60 border border-amber-500/30 hover:border-amber-500/60 shadow-lg text-left transition-all duration-200 group flex flex-col justify-between cursor-pointer min-h-[170px]"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 group-hover:rotate-180 transition-transform duration-500">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  Reboot
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white text-base group-hover:text-amber-300 transition-colors">
                  Restart PC
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Fast system restart
                </p>
              </div>
            </button>

            {/* 5. Shut Down PC Tile */}
            <button
              onClick={() => handleRequestPowerAction('shutdown')}
              className="relative p-5 rounded-3xl bg-[#111728]/95 hover:bg-rose-950/60 border border-rose-500/30 hover:border-rose-500/60 shadow-lg text-left transition-all duration-200 group flex flex-col justify-between cursor-pointer min-h-[170px]"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">
                  <Power className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                  Power Off
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white text-base group-hover:text-rose-300 transition-colors">
                  Shut Down
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Complete shutdown
                </p>
              </div>
            </button>

            {/* 6. Lock Workstation Tile */}
            <button
              onClick={() => handleRequestPowerAction('lock')}
              className="relative p-5 rounded-3xl bg-[#111728]/95 hover:bg-blue-950/60 border border-blue-500/30 hover:border-blue-500/60 shadow-lg text-left transition-all duration-200 group flex flex-col justify-between cursor-pointer min-h-[170px]"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                  <Lock className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                  Lock
                </span>
              </div>
              <div>
                <h4 className="font-bold text-white text-base group-hover:text-blue-300 transition-colors">
                  Lock Screen
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-snug">
                  Lock active session
                </p>
              </div>
            </button>

          </div>

        </div>

        {/* SECTION 2: REMOTE ACCESS GATEWAY (3 EQUAL-SIZED CYBER-GLASS CARDS) */}
        <div className="mb-8">
          
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-cyan-400" />
              Remote Access Gateway
            </h2>
            <span className="text-xs text-slate-500">
              Multi-Protocol Remote Connections
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* 1. Chrome Remote Desktop Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#12192b]/95 to-[#0e1424]/95 border border-blue-500/30 hover:border-blue-500/60 p-6 shadow-xl group transition-all duration-300 flex flex-col justify-between min-h-[260px]">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 group-hover:bg-blue-500/20 transition-all duration-300 shrink-0">
                  <Monitor className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-lg group-hover:text-blue-300 transition-colors">
                      Chrome Remote
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Screen GUI
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Full interactive desktop control, multi-monitor display, and file transfer directly in Chrome.
                  </p>
                </div>
              </div>

              {isPcOnline ? (
                <a
                  href={remoteDesktopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 transition-all duration-200 cursor-pointer"
                >
                  <span>Launch Screen Control</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              ) : (
                <button
                  disabled
                  className="w-full py-3.5 px-5 rounded-2xl bg-blue-600/30 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 opacity-40 cursor-not-allowed border border-blue-500/20"
                >
                  <span>Launch Screen Control</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>

            {/* 2. Google Antigravity Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#12192b]/95 to-[#0e1424]/95 border border-purple-500/30 hover:border-purple-500/60 p-6 shadow-xl group transition-all duration-300 flex flex-col justify-between min-h-[260px]">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 group-hover:bg-purple-500/20 transition-all duration-300 shrink-0">
                  <Bot className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-lg group-hover:text-purple-300 transition-colors">
                      Antigravity
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      AI Agent
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Access your Google Antigravity development workspace and agentic coding environment.
                  </p>
                </div>
              </div>

              {isPcOnline ? (
                <a
                  href={antigravityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-200 cursor-pointer"
                >
                  <span>Launch Antigravity</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              ) : (
                <button
                  disabled
                  className="w-full py-3.5 px-5 rounded-2xl bg-purple-600/30 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 opacity-40 cursor-not-allowed border border-purple-500/20"
                >
                  <span>Launch Antigravity</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>

            {/* 3. Remote PowerShell Terminal Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#12192b]/95 to-[#0e1424]/95 border border-emerald-500/30 hover:border-emerald-500/60 p-6 shadow-xl group transition-all duration-300 flex flex-col justify-between min-h-[260px]">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 group-hover:bg-emerald-500/20 transition-all duration-300 shrink-0">
                  <Terminal className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-lg group-hover:text-emerald-300 transition-colors">
                      Remote Terminal
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      PowerShell CLI
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Interactive command line console to run PowerShell scripts, check processes, and manage services.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsTerminalOpen(true)}
                disabled={!isPcOnline}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-slate-950" />
                <span>Open PowerShell Console</span>
              </button>
            </div>

          </div>

        </div>

        {/* SECTION 3: PC HARDWARE TELEMETRY & STATUS */}
        <div className="p-6 rounded-3xl bg-[#101726]/80 border border-slate-800 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Live Hardware Performance
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {telemetry?.cpuModel ? `${telemetry.cpuModel.trim()} (${telemetry.cpuCores} Cores)` : 'PC Telemetry'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* CPU Bar */}
            <div className="p-4 rounded-2xl bg-[#0c111d] border border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="flex items-center gap-2 font-semibold text-slate-300">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  CPU Utilization
                </span>
                <span className="font-mono font-bold text-cyan-400">
                  {isPcOnline ? `${cpuPercent}%` : 'Standby'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 rounded-full"
                  style={{ width: `${isPcOnline ? cpuPercent : 0}%` }}
                ></div>
              </div>
            </div>

            {/* RAM Bar */}
            <div className="p-4 rounded-2xl bg-[#0c111d] border border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="flex items-center gap-2 font-semibold text-slate-300">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  Memory Usage {telemetry?.usedRamGB ? `(${telemetry.usedRamGB} / ${telemetry.totalRamGB} GB)` : ''}
                </span>
                <span className="font-mono font-bold text-purple-400">
                  {isPcOnline ? `${ramPercent}%` : 'Standby'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 rounded-full"
                  style={{ width: `${isPcOnline ? ramPercent : 0}%` }}
                ></div>
              </div>
            </div>

          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-[#090d16]/90 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span className="font-semibold text-slate-300">Nexus PC Controller</span>
            <span className="text-cyan-400 font-mono font-bold text-[11px] bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">{APP_VERSION}</span>
            <span>• Remote PC Control Dashboard</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <button onClick={() => setIsWizardOpen(true)} className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1">
              <Download className="w-3.5 h-3.5" />
              <span>Download & Setup</span>
            </button>
            <span>•</span>
            <button onClick={() => setIsPairOpen(true)} className="hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5" />
              <span>6-Digit PIN Pairing</span>
            </button>
            <span>•</span>
            <button onClick={() => setIsSettingsOpen(true)} className="hover:text-cyan-300 transition-colors cursor-pointer">
              Settings & Relays
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <InstallWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
      />

      <PairModal
        isOpen={isPairOpen}
        onClose={() => setIsPairOpen(false)}
        onPaired={handlePaired}
        currentPairCode={settings.pairCode}
      />

      <ConfirmPowerModal
        isOpen={powerActionModal.isOpen}
        action={powerActionModal.action}
        onClose={() => setPowerActionModal({ isOpen: false, action: null })}
        onConfirm={handleConfirmPowerAction}
        onAbort={() => handleConfirmPowerAction('abort')}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        apps={[]}
        onRestoreDefaultApps={() => {}}
        onImportData={() => {}}
        onShowToast={addToast}
      />

      <TerminalModal
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        settings={settings}
        relayManager={relayManagerRef.current}
        isAgentOnline={isPcOnline}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
}
