// Nexus Standard Dashboard API, Relay WebSocket & Storage Utilities

const SETTINGS_KEY = 'nexus_dashboard_standard_v6';

export const DEFAULT_SETTINGS = {
  relayUrl: typeof window !== 'undefined' ? window.location.origin : 'https://nexus.hajimammad.com',
  roomId: '',
  token: '',
  pairCode: '',
  targetMac: '',
  targetIp: '',
  hostname: '',
  agentUrl: '',
  agentKey: '',
  macrodroidWebhookUrl: '',
  remoteDesktopUrl: 'https://remotedesktop.google.com/access',
  antigravityUrl: 'https://antigravity.google.com',
  autoRefreshStats: true,
  refreshIntervalMs: 4000
};

// Load settings from localStorage
export function getStoredSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading settings:', e);
  }
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
export function saveStoredSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Error saving settings:', e);
  }
}

// -------------------------------------------------------------
// 1. 6-Digit Pairing Claim Helper
// -------------------------------------------------------------
export async function claimPairCode(pairCode, relayUrl = null) {
  if (!pairCode) throw new Error('Pairing code is required.');
  const cleanCode = pairCode.toString().trim().replace(/[-\s]/g, '');
  const baseRelay = (relayUrl || DEFAULT_SETTINGS.relayUrl).replace(/\/$/, '');

  const candidateEndpoints = [
    `${baseRelay}/api/pair/claim`,
    'https://pc.hajimammad.com/api/pair/claim',
    'http://localhost:48880/api/pair/claim',
    'https://nexus.hajimammad.com/api/pair/claim'
  ];

  for (const ep of candidateEndpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairCode: cleanCode })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return {
            relayUrl: baseRelay,
            roomId: data.roomId,
            token: data.token,
            pairCode: data.pairCode,
            targetMac: data.targetMac,
            targetIp: data.targetIp,
            hostname: data.hostname,
            agentKey: data.agentKey
          };
        }
      }
    } catch (e) {
      // Continue to next candidate
    }
  }

  // Resilient Zero-Config Fallback: Connect directly to the deterministic PC relay room
  return {
    relayUrl: baseRelay,
    roomId: `room_${cleanCode}_pc`,
    token: `token_${cleanCode}`,
    pairCode: cleanCode,
    targetMac: '',
    targetIp: '',
    hostname: 'Nexus-PC',
    agentKey: ''
  };
}

// -------------------------------------------------------------
// 2. Real-Time Cloudflare WebSocket Relay Client
// -------------------------------------------------------------
export class RelayManager {
  constructor(options = {}) {
    this.relayUrl = options.relayUrl || DEFAULT_SETTINGS.relayUrl;
    this.roomId = options.roomId || '';
    this.token = options.token || '';
    this.ws = null;
    this.isConnected = false;
    this.onTelemetry = options.onTelemetry || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.onTerminalResult = options.onTerminalResult || (() => {});
    this.onActionResponse = options.onActionResponse || (() => {});
    this.reconnectTimer = null;
    this.reqCallbacks = new Map();
  }

  updateConfig(relayUrl, roomId, token) {
    this.relayUrl = relayUrl || this.relayUrl;
    this.roomId = roomId || this.roomId;
    this.token = token || this.token;
    this.connect();
  }

  connect() {
    if (!this.roomId) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const baseRelay = this.relayUrl.replace(/\/$/, '');
    const wsUrl = `${baseRelay.replace(/^http/, 'ws')}/api/relay?room=${encodeURIComponent(this.roomId)}&role=client&token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.onStateChange({ online: true, source: 'relay' });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TELEMETRY' && msg.data) {
            this.onTelemetry(msg.data);
            this.onStateChange({ online: true, source: 'relay' });
          } else if (msg.type === 'ROOM_STATE') {
            this.onStateChange({ online: msg.online, agentsCount: msg.agentsCount, satellitesCount: msg.satellitesCount, source: 'relay' });
          } else if (msg.type === 'TERMINAL_RESULT') {
            this.onTerminalResult(msg.result);
          } else if (msg.type === 'ACTION_RESPONSE') {
            this.onActionResponse(msg);
          }
        } catch (e) {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onStateChange({ online: false, source: 'relay' });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.ws.close();
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 4000);
  }

  sendCommand(action, subAction = null, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Relay connection is not open.');
    }
    const reqId = Date.now() + Math.random().toString(36).slice(2);
    this.ws.send(JSON.stringify({
      type: 'COMMAND',
      action,
      subAction,
      payload,
      reqId,
      timestamp: new Date().toISOString()
    }));
    return reqId;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

// -------------------------------------------------------------
// 3. Power Actions (Relay & Local Fallback)
// -------------------------------------------------------------
export async function executePowerAction(action, settings, relayManager = null, options = {}) {
  // 1. Try WebSocket Relay First
  if (relayManager && relayManager.isConnected) {
    if (action === 'wake') {
      relayManager.sendCommand('WAKE', null, { targetMac: settings.targetMac });
      return { success: true, message: 'Wake-on-LAN magic packet dispatched via Home Satellite!' };
    }
    if (action === 'unlock') {
      relayManager.sendCommand('UNLOCK', null, { targetIp: settings.targetIp });
      return { success: true, message: 'OpenSSH unlock signal dispatched via Home Satellite!' };
    }
    // Power actions (sleep, restart, shutdown, lock)
    relayManager.sendCommand('POWER', action, options);
    return { success: true, message: `${action.toUpperCase()} command dispatched to PC!` };
  }

  // 2. Direct HTTP Local Fallback (if on same Wi-Fi)
  if (settings.agentUrl) {
    const baseUrl = settings.agentUrl.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (settings.agentKey) headers['Authorization'] = `Bearer ${settings.agentKey}`;

    const res = await fetch(`${baseUrl}/api/power/${action}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `Failed to execute ${action}`);
    return data;
  }

  throw new Error('Neither Cloud Relay nor Local Agent is currently connected.');
}

// -------------------------------------------------------------
// 4. Remote Terminal Command
// -------------------------------------------------------------
export async function executeTerminalCommand(command, settings, relayManager = null, cwd = null) {
  if (relayManager && relayManager.isConnected) {
    relayManager.sendCommand('TERMINAL', null, { command, cwd });
    return { success: true, message: 'Command sent to PC via Relay.' };
  }

  if (settings.agentUrl) {
    const baseUrl = settings.agentUrl.replace(/\/$/, '');
    const headers = { 'Content-Type': 'application/json' };
    if (settings.agentKey) headers['Authorization'] = `Bearer ${settings.agentKey}`;

    const res = await fetch(`${baseUrl}/api/terminal/exec`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command, cwd })
    });
    const data = await res.json();
    return data;
  }

  throw new Error('Terminal offline: No active Relay or Local connection.');
}

// -------------------------------------------------------------
// 5. Fetch Agent Status (HTTP Local Poll)
// -------------------------------------------------------------
export async function fetchAgentStatus(agentUrl, agentKey) {
  if (!agentUrl) return { online: false };
  const baseUrl = agentUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (agentKey) headers['Authorization'] = `Bearer ${agentKey}`;

    const res = await fetch(`${baseUrl}/api/status`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { online: false };
    const data = await res.json();
    return data.success ? { online: true, ...data.data } : { online: false };
  } catch {
    clearTimeout(timeoutId);
    return { online: false };
  }
}

// Legacy MacroDroid Fallback
export async function triggerMacroDroid(webhookUrl) {
  if (!webhookUrl || !webhookUrl.trim()) throw new Error('MacroDroid URL not configured.');
  await fetch(webhookUrl.trim(), { method: 'GET', mode: 'no-cors' });
  return { success: true, message: 'MacroDroid WOL webhook triggered!' };
}

// Smart Configuration File Parser
export function parseSettingsFile(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Selected file is empty or invalid.');
  }

  const result = {};
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.relayUrl) result.relayUrl = parsed.relayUrl;
      if (parsed.roomId) result.roomId = parsed.roomId;
      if (parsed.token) result.token = parsed.token;
      if (parsed.agentUrl) result.agentUrl = parsed.agentUrl;
      if (parsed.agentKey) result.agentKey = parsed.agentKey;
      if (parsed.macrodroidWebhookUrl) result.macrodroidWebhookUrl = parsed.macrodroidWebhookUrl;
      if (parsed.remoteDesktopUrl) result.remoteDesktopUrl = parsed.remoteDesktopUrl;
      if (parsed.antigravityUrl) result.antigravityUrl = parsed.antigravityUrl;
      return result;
    } catch (e) {}
  }
  return result;
}

// Export Settings File Helper
export function exportSettingsFile(settings) {
  const exportData = {
    relayUrl: settings.relayUrl || 'https://nexus.hajimammad.com',
    roomId: settings.roomId || '',
    token: settings.token || '',
    pairCode: settings.pairCode || '',
    targetMac: settings.targetMac || '',
    targetIp: settings.targetIp || '',
    agentUrl: settings.agentUrl || '',
    agentKey: settings.agentKey || '',
    remoteDesktopUrl: settings.remoteDesktopUrl || 'https://remotedesktop.google.com/access',
    antigravityUrl: settings.antigravityUrl || 'https://antigravity.google.com',
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nexus-secrets.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
