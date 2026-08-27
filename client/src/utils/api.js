// Nexus Dashboard API & Storage Utilities

const SETTINGS_KEY = 'nexus_dashboard_settings_v5';

export const DEFAULT_SETTINGS = {
  macrodroidWebhookUrl: '', // e.g. https://trigger.macrodroid.com/xxxx/power-on
  agentUrl: '',
  agentKey: '',
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

// Smart Configuration File Parser (Supports JSON, Markdown, ENV, and Text)
export function parseSettingsFile(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Selected file is empty or invalid.');
  }

  const result = {};

  // 1. Try parsing as JSON first
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.agentUrl || parsed.AGENT_URL || parsed.agent_url) {
        result.agentUrl = parsed.agentUrl || parsed.AGENT_URL || parsed.agent_url || '';
      }
      if (parsed.agentKey || parsed.AGENT_KEY || parsed.agent_key) {
        result.agentKey = parsed.agentKey || parsed.AGENT_KEY || parsed.agent_key || '';
      }
      if (parsed.macrodroidWebhookUrl || parsed.MACRODROID_URL || parsed.webhookUrl || parsed.webhook) {
        result.macrodroidWebhookUrl = parsed.macrodroidWebhookUrl || parsed.MACRODROID_URL || parsed.webhookUrl || parsed.webhook || '';
      }
      if (parsed.remoteDesktopUrl || parsed.REMOTE_DESKTOP_URL || parsed.chromeRdpUrl) {
        result.remoteDesktopUrl = parsed.remoteDesktopUrl || parsed.REMOTE_DESKTOP_URL || parsed.chromeRdpUrl || '';
      }
      if (parsed.antigravityUrl || parsed.ANTIGRAVITY_URL || parsed.antigravity) {
        result.antigravityUrl = parsed.antigravityUrl || parsed.ANTIGRAVITY_URL || parsed.antigravity || '';
      }
      return result;
    } catch (e) {
      // Fall through to regex text parser
    }
  }

  // 2. Parse as Markdown / Text / ENV file using regex
  const cleanStr = (val) => val ? val.replace(/[`"']/g, '').trim() : '';

  // Agent URL (e.g. https://pcagent.yourdomain.com)
  const agentUrlMatch = rawText.match(/(?:Agent\s*URL|AGENT_URL|PC_AGENT_URL|Agent\s*Endpoint)[\s*:=]+[`"']?(https?:\/\/[^\s`"'\)]+)/i);
  if (agentUrlMatch) result.agentUrl = cleanStr(agentUrlMatch[1]);

  // Agent Key (e.g. 40-char token)
  const agentKeyMatch = rawText.match(/(?:Agent\s*(?:Secret\s*)?Key|AGENT_KEY|AGENT_SECRET_KEY|SECRET_KEY|Token)[\s*:=]+[`"']?([a-zA-Z0-9_-]{20,80})/i);
  if (agentKeyMatch) result.agentKey = cleanStr(agentKeyMatch[1]);

  // MacroDroid Webhook (e.g. https://trigger.macrodroid.com/...)
  const macrodroidMatch = rawText.match(/(?:MacroDroid(?:\s*WOL)?(?:\s*Webhook)?|WOL|Wake|Webhook|Power[-_\s]*ON)[\s*:=]+[`"']?(https?:\/\/[^\s`"'\)]+)/i);
  if (macrodroidMatch) result.macrodroidWebhookUrl = cleanStr(macrodroidMatch[1]);

  // Chrome Remote Desktop URL
  const remoteDesktopMatch = rawText.match(/(?:Chrome\s*Remote(?:\s*Desktop)?(?:\s*URL)?|Remote\s*Desktop|CHROME_RDP)[\s*:=]+[`"']?(https?:\/\/[^\s`"'\)]+)/i);
  if (remoteDesktopMatch) result.remoteDesktopUrl = cleanStr(remoteDesktopMatch[1]);

  // Antigravity URL
  const antigravityMatch = rawText.match(/(?:Antigravity(?:\s*URL)?)[\s*:=]+[`"']?(https?:\/\/[^\s`"'\)]+)/i);
  if (antigravityMatch) result.antigravityUrl = cleanStr(antigravityMatch[1]);

  const extractedCount = Object.keys(result).length;
  if (extractedCount === 0) {
    throw new Error('No recognized configuration credentials found in this file. Please check file format.');
  }

  return result;
}

// Export Settings File Helper
export function exportSettingsFile(settings) {
  const exportData = {
    agentUrl: settings.agentUrl || '',
    agentKey: settings.agentKey || '',
    macrodroidWebhookUrl: settings.macrodroidWebhookUrl || '',
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

// Trigger MacroDroid Webhook
export async function triggerMacroDroid(webhookUrl, agentUrl = null, agentKey = null) {
  if (!webhookUrl || !webhookUrl.trim()) {
    throw new Error('MacroDroid Webhook URL is not configured. Please open Settings to configure it.');
  }

  const cleanUrl = webhookUrl.trim();

  // Try direct fetch first
  try {
    await fetch(cleanUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache'
    });
    return { success: true, message: 'MacroDroid Power-ON signal dispatched successfully!' };
  } catch (err) {
    console.warn('Direct fetch failed, attempting relay via PC Agent...', err);
  }

  // If direct failed, try authenticated agent relay
  if (agentUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (agentKey) {
        headers['Authorization'] = `Bearer ${agentKey}`;
      }

      const res = await fetch(`${agentUrl.replace(/\/$/, '')}/api/trigger-webhook`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: cleanUrl, method: 'GET' })
      });
      const data = await res.json();
      if (data.success) {
        return { success: true, message: 'MacroDroid signal sent via Authenticated Agent Relay!' };
      }
    } catch (relayErr) {
      console.warn('Agent relay failed:', relayErr);
    }
  }

  // Fallback image beacon
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ success: true, message: 'MacroDroid signal sent via Webhook Beacon!' });
    img.onerror = () => resolve({ success: true, message: 'MacroDroid signal dispatched!' });
    img.src = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  });
}

// Check PC Agent Status
export async function fetchAgentStatus(agentUrl, agentKey) {
  if (!agentUrl) return { online: false, error: 'No agent URL configured' };
  
  const baseUrl = agentUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (agentKey) {
      headers['Authorization'] = `Bearer ${agentKey}`;
    }

    const res = await fetch(`${baseUrl}/api/status`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { online: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    if (data.success) {
      return { online: true, ...data.data };
    }
    return { online: false, error: data.error || 'Agent returned error' };
  } catch (err) {
    clearTimeout(timeoutId);
    return { online: false, error: err.name === 'AbortError' ? 'Connection timed out' : 'Agent offline / standby' };
  }
}

// Execute Power Action on PC Agent
export async function executePowerAction(action, agentUrl, agentKey, options = {}) {
  if (!agentUrl) throw new Error('Agent URL is required');
  const baseUrl = agentUrl.replace(/\/$/, '');

  const validActions = ['sleep', 'restart', 'shutdown', 'abort', 'lock'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action: ${action}`);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (agentKey) {
    headers['Authorization'] = `Bearer ${agentKey}`;
  }

  const res = await fetch(`${baseUrl}/api/power/${action}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options)
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to execute ${action}`);
  }
  return data;
}

// Fetch Windows Session Status
export async function fetchSessionStatus(agentUrl, agentKey) {
  if (!agentUrl) return null;
  const baseUrl = agentUrl.replace(/\/$/, '');
  const headers = {};
  if (agentKey) headers['Authorization'] = `Bearer ${agentKey}`;

  try {
    const res = await fetch(`${baseUrl}/api/session/status`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}


// Execute Remote Terminal Command
export async function executeTerminalCommand(agentUrl, agentKey, command, cwd = null) {
  if (!agentUrl) throw new Error('PC Agent URL is not configured.');
  if (!command || !command.trim()) throw new Error('Command cannot be empty.');

  const baseUrl = agentUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (agentKey) headers['Authorization'] = `Bearer ${agentKey}`;

  const res = await fetch(`${baseUrl}/api/terminal/exec`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command, cwd })
  });

  const data = await res.json();
  if (res.status === 401) {
    throw new Error('Unauthorized: Invalid Agent Secret Key.');
  }
  return data;
}
