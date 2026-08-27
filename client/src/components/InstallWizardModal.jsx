import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Monitor, 
  Smartphone, 
  Terminal, 
  Copy, 
  Check, 
  ExternalLink, 
  Zap, 
  Radio, 
  ShieldCheck, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

export default function InstallWizardModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('pc'); // 'pc' or 'satellite'
  const [copiedCmd, setCopiedCmd] = useState(null);

  if (!isOpen) return null;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const pcPowerShellCmd = `irm https://nexus.hajimammad.com/install-pc.ps1 | iex`;
  const satelliteBashCmd = `curl -sSL https://nexus.hajimammad.com/satellite.sh | bash`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#0d121f] border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-cyan-500/10 text-white max-h-[90vh] overflow-y-auto">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-white">Setup & Installation Wizard</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                Universal
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Zero-configuration install for your PC and Home Relay
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#070a12] border border-slate-800 rounded-2xl mb-6">
          <button
            onClick={() => setActiveTab('pc')}
            className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'pc'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>1. Windows PC Agent</span>
          </button>

          <button
            onClick={() => setActiveTab('satellite')}
            className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'satellite'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>2. Home Relay (Old Phone/Server)</span>
          </button>
        </div>

        {/* TAB 1: WINDOWS PC AGENT */}
        {activeTab === 'pc' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Primary Action Card: Download ZIP */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#12192b] to-[#0e1424] border border-cyan-500/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>Download Ready-to-Run PC Package</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Includes Graphical <code className="text-cyan-300 font-mono">Setup.cmd</code> Wizard (Next &gt; Next &gt; Install &gt; Finish).
                  </p>
                </div>

                <a
                  href="/download/nexus-pc-agent.zip"
                  download="nexus-pc-agent.zip"
                  className="py-3 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-cyan-500/20 transition-all shrink-0 flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>DOWNLOAD .ZIP</span>
                </a>
              </div>
            </div>

            {/* Quick 1-Liner PowerShell Terminal Alternative */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Or Install via PowerShell (1 Line):
              </label>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070a12] border border-slate-800 text-xs font-mono text-cyan-300">
                <span className="truncate mr-3">{pcPowerShellCmd}</span>
                <button
                  onClick={() => copyToClipboard(pcPowerShellCmd, 'pc')}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors shrink-0 cursor-pointer"
                  title="Copy command"
                >
                  {copiedCmd === 'pc' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 3 Step Visual Guide */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">How to Run on Your PC:</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0f1524] border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] mb-2">1</span>
                  <p className="font-bold text-white">Extract ZIP</p>
                  <p className="text-slate-400 mt-1 text-[11px]">Unzip downloaded folder anywhere on PC.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0f1524] border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] mb-2">2</span>
                  <p className="font-bold text-white">Double-Click Setup.cmd</p>
                  <p className="text-slate-400 mt-1 text-[11px]">Follow graphical "Next &gt; Next &gt; Install" wizard.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0f1524] border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px] mb-2">3</span>
                  <p className="font-bold text-white">Get 6-Digit PIN</p>
                  <p className="text-slate-400 mt-1 text-[11px]">Wizard displays your PIN &amp; opens dashboard.</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: UNIVERSAL HOME SATELLITE (ANDROID APP & SERVER) */}
        {activeTab === 'satellite' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Primary Action Card: Download Android APK */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#122620] to-[#0e1c18] border border-emerald-500/40 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Recommended • 0 3rd Party Apps
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-base mt-1.5 flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-emerald-400" />
                    <span>Download Native Android App (.apk)</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Lightweight standalone APK with native WakeLock. Install on any old phone on home Wi-Fi.
                  </p>
                </div>

                <a
                  href="/download/nexus-satellite.apk"
                  download="nexus-satellite.apk"
                  className="py-3.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-emerald-500/30 transition-all shrink-0 flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>DOWNLOAD APK</span>
                </a>
              </div>
            </div>

            {/* 3 Step Visual Guide for Android App */}
            <div className="space-y-3 pt-1">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">How to Setup on Android Phone:</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0f1524] border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] mb-2">1</span>
                  <p className="font-bold text-white">Install APK</p>
                  <p className="text-slate-400 mt-1 text-[11px]">Install on old phone connected to home Wi-Fi.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0f1524] border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] mb-2">2</span>
                  <p className="font-bold text-white">Enter 6-Digit PIN</p>
                  <p className="text-slate-400 mt-1 text-[11px]">Type PIN from your PC setup screen.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0f1524] border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] mb-2">3</span>
                  <p className="font-bold text-white">Start 24/7 Relay</p>
                  <p className="text-slate-400 mt-1 text-[11px]">Tap start — relay stays active in background!</p>
                </div>
              </div>
            </div>

            {/* Alternative: Download Server Relay Package (for Linux / Windows Server) */}
            <div className="p-4 rounded-2xl bg-[#0f1524] border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-white text-xs">Using a Linux / Mac / Server instead of a phone?</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Download standalone Node.js Home Relay package.</p>
              </div>

              <a
                href="/download/nexus-satellite.zip"
                download="nexus-satellite.zip"
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs tracking-wide transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Download Server .zip</span>
              </a>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
