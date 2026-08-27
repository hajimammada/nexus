import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, Trash2, Copy, Check, X, ShieldAlert, Cpu, HardDrive, Wifi, Sparkles, RefreshCw, CornerDownLeft } from 'lucide-react';
import { executeTerminalCommand } from '../utils/api';

export default function TerminalModal({ isOpen, onClose, agentUrl, agentKey, isAgentOnline }) {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandLog, setCommandLog] = useState([
    {
      id: 'welcome',
      command: '# Welcome to Nexus Remote PowerShell Console',
      output: 'Ready to execute administrative commands via secure Cloudflare Tunnel.',
      error: '',
      exitCode: 0,
      timestamp: new Date().toLocaleTimeString(),
      durationMs: 0
    }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const outputEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commandLog, isRunning]);

  if (!isOpen) return null;

  const quickPresets = [
    {
      label: 'Top RAM Apps',
      icon: Cpu,
      cmd: 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 8 -Property Id, ProcessName, @{Name="RAM (MB)"; Expression={[math]::Round($_.WorkingSet64 / 1MB, 1)}} | Format-Table -AutoSize'
    },
    {
      label: 'Disk Space',
      icon: HardDrive,
      cmd: 'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{Name="Free (GB)"; Expression={[math]::Round($_.Free / 1GB, 1)}}, @{Name="Used (GB)"; Expression={[math]::Round($_.Used / 1GB, 1)}}, Root | Format-Table -AutoSize'
    },
    {
      label: 'Network IP',
      icon: Wifi,
      cmd: 'ipconfig | Select-String "IPv4", "Default Gateway", "Subnet"'
    },
    {
      label: 'PC Boot Time',
      icon: RefreshCw,
      cmd: '(Get-CimInstance Win32_OperatingSystem).LastBootUpTime'
    },
    {
      label: 'Running Services',
      icon: Sparkles,
      cmd: 'Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object -First 10 -Property Name, DisplayName | Format-Table -AutoSize'
    }
  ];

  const handleRunCommand = async (cmdToRun = command) => {
    const targetCmd = (cmdToRun || '').trim();
    if (!targetCmd || isRunning) return;

    if (targetCmd.toLowerCase() === 'clear' || targetCmd.toLowerCase() === 'cls') {
      setCommandLog([]);
      setCommand('');
      return;
    }

    setIsRunning(true);
    setCommand('');
    setHistory(prev => [targetCmd, ...prev.filter(c => c !== targetCmd)]);
    setHistoryIndex(-1);

    const logId = Date.now().toString();
    const newEntry = {
      id: logId,
      command: targetCmd,
      output: '',
      error: '',
      exitCode: null,
      timestamp: new Date().toLocaleTimeString(),
      durationMs: 0,
      running: true
    };

    setCommandLog(prev => [...prev, newEntry]);

    try {
      const res = await executeTerminalCommand(agentUrl, agentKey, targetCmd);
      setCommandLog(prev =>
        prev.map(item =>
          item.id === logId
            ? {
                ...item,
                output: res.output || '',
                error: res.error || '',
                exitCode: res.exitCode,
                durationMs: res.durationMs || 0,
                running: false
              }
            : item
        )
      );
    } catch (err) {
      setCommandLog(prev =>
        prev.map(item =>
          item.id === logId
            ? {
                ...item,
                error: err.message || 'Execution failed',
                exitCode: 1,
                running: false
              }
            : item
        )
      );
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRunCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const prevIdx = historyIndex - 1;
        setHistoryIndex(prevIdx);
        setCommand(history[prevIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setCommandLog([]);
    }
  };

  const handleCopyAll = () => {
    const allText = commandLog
      .map(
        item =>
          `[${item.timestamp}] > ${item.command}\n${item.output || ''}${
            item.error ? `\nERROR: ${item.error}` : ''
          }`
      )
      .join('\n\n');
    navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl h-[90vh] max-h-[850px] rounded-3xl bg-[#0a0f1d] border border-cyan-500/30 shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#0d1424] border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>

            <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>

            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-white tracking-wide">
                Windows PowerShell Remote Console
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isAgentOnline ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'}`}>
                {isAgentOnline ? 'Agent Connected' : 'Agent Offline'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              title="Copy Output"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={() => setCommandLog([])}
              title="Clear Terminal (Ctrl+L)"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600/30 text-slate-300 hover:text-rose-300 border border-transparent hover:border-rose-500/30 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Command Presets */}
        <div className="px-4 py-2.5 bg-[#090d18] border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap mr-1">
            Shortcuts:
          </span>
          {quickPresets.map((preset, idx) => {
            const Icon = preset.icon;
            return (
              <button
                key={idx}
                onClick={() => handleRunCommand(preset.cmd)}
                disabled={isRunning || !isAgentOnline}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/60 hover:border-cyan-500/40 text-[11px] font-mono flex items-center gap-1.5 whitespace-nowrap transition-all duration-150 disabled:opacity-40 cursor-pointer"
              >
                <Icon className="w-3 h-3 text-cyan-400" />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Terminal Screen Body */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto font-mono text-xs space-y-4 select-text bg-[#070b14]">
          {commandLog.map((log) => (
            <div key={log.id} className="space-y-1.5">
              
              {/* Command Prompt Line */}
              <div className="flex items-center justify-between text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800/80">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold overflow-x-auto">
                  <span className="text-purple-400 select-none">PS &gt;</span>
                  <span className="text-slate-100">{log.command}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 shrink-0 select-none">
                  {log.durationMs > 0 && <span>{log.durationMs}ms</span>}
                  <span>{log.timestamp}</span>
                  {log.exitCode !== null && (
                    <span className={`px-1.5 py-0.5 rounded font-bold ${log.exitCode === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      exit {log.exitCode}
                    </span>
                  )}
                </div>
              </div>

              {/* Running Spinner */}
              {log.running && (
                <div className="flex items-center gap-2 text-amber-300 text-xs px-3 py-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing PowerShell command on remote PC...</span>
                </div>
              )}

              {/* Standard Output */}
              {log.output && (
                <pre className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {log.output}
                </pre>
              )}

              {/* Standard Error */}
              {log.error && (
                <pre className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {log.error}
                </pre>
              )}

            </div>
          ))}

          <div ref={outputEndRef} />
        </div>

        {/* Input Bar Footer */}
        <div className="p-3 sm:p-4 bg-[#0d1424] border-t border-slate-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunCommand();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1 flex items-center bg-[#070b14] border border-slate-700 focus-within:border-cyan-500 rounded-2xl px-4 py-2.5 transition-colors">
              <span className="font-mono text-xs font-bold text-cyan-400 mr-2 select-none">
                PS &gt;
              </span>
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isRunning || !isAgentOnline}
                placeholder={isAgentOnline ? "Type any PowerShell command (e.g. dir, Get-Process, ipconfig)..." : "PC Agent is currently offline"}
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isRunning || !command.trim() || !isAgentOnline}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              {isRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Run</span>
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
