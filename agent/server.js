const express = require('express');
const cors = require('cors');
const os = require('os');
const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 48880;
const AGENT_KEY = process.env.AGENT_KEY || crypto.randomBytes(24).toString('hex');
const RELAY_URL = (process.env.RELAY_URL || 'https://nexus.hajimammad.com').replace(/\/$/, '');

// Ensure AGENT_KEY exists in .env
try {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `AGENT_KEY=${AGENT_KEY}\nPORT=${PORT}\nRELAY_URL=${RELAY_URL}\n`, 'utf8');
  }
} catch (e) {}

// Security Headers & Payload Size Limits
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-agent-key']
}));
app.use(express.json({ limit: '100kb' }));

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' }
});
app.use('/api/', globalLimiter);

// Timing-Safe Key Comparison Helper
function safeCompare(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Auth verification middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-agent-key'];
  const token = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.slice(7) 
    : customHeader;

  const reqKey = token || req.query.key;

  if (!AGENT_KEY || !reqKey || !safeCompare(reqKey, AGENT_KEY)) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid or missing Agent Secret Key.' 
    });
  }
  next();
}

// Helper: Network Details
function getPrimaryNetworkInfo() {
  const ifaces = os.networkInterfaces();
  for (let dev in ifaces) {
    for (let details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal && details.mac && details.mac !== '00:00:00:00:00:00') {
        return {
          ip: details.address,
          mac: details.mac.toUpperCase()
        };
      }
    }
  }
  return { ip: '127.0.0.1', mac: '' };
}

// System CPU utilization calculation helper
let lastCpuInfo = null;
function getCpuUsage() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  });

  if (!lastCpuInfo) {
    lastCpuInfo = { idle, total };
    return 0;
  }

  const idleDiff = idle - lastCpuInfo.idle;
  const totalDiff = total - lastCpuInfo.total;
  lastCpuInfo = { idle, total };

  if (totalDiff === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - (idleDiff / totalDiff)) * 100)));
}

function getTelemetryPayload() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsagePercent = Math.round((usedMem / totalMem) * 100);
  const cpuUsage = getCpuUsage();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptimeSeconds: os.uptime(),
    uptimeFormatted: formatUptime(os.uptime()),
    cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
    cpuCores: os.cpus().length,
    cpuUsagePercent: cpuUsage,
    totalRamGB: (totalMem / (1024 ** 3)).toFixed(1),
    usedRamGB: (usedMem / (1024 ** 3)).toFixed(1),
    freeRamGB: (freeMem / (1024 ** 3)).toFixed(1),
    ramUsagePercent: ramUsagePercent,
    timestamp: new Date().toISOString()
  };
}

const POWERSHELL_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const SHUTDOWN_PATH = 'C:\\Windows\\System32\\shutdown.exe';
const TSDISCON_PATH = 'C:\\Windows\\System32\\tsdiscon.exe';
const RUNDLL32_PATH = 'C:\\Windows\\System32\\rundll32.exe';

const LOG_FILE = path.join(__dirname, 'agent_activity.log');
function logAction(msg) {
  const entry = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, entry); } catch (e) {}
  console.log(msg);
}

// -------------------------------------------------------------
// Core Actions Implementation
// -------------------------------------------------------------
function executeSleep() {
  logAction('[POWER] Executing Sleep mode...');
  execFile(POWERSHELL_PATH, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)'
  ], (err) => {
    if (err) execFile(RUNDLL32_PATH, ['powrprof.dll,SetSuspendState', '0,1,0']);
  });
}

function executeRestart() {
  logAction('[POWER] Executing Restart (1s delay)...');
  execFile(SHUTDOWN_PATH, ['/r', '/t', '1'], (err) => {
    if (err) execFile(POWERSHELL_PATH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Restart-Computer -Force']);
  });
}

function executeShutdown() {
  logAction('[POWER] Executing Shutdown (1s delay)...');
  execFile(SHUTDOWN_PATH, ['/s', '/t', '1'], (err) => {
    if (err) execFile(POWERSHELL_PATH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Stop-Computer -Force']);
  });
}

function executeLock() {
  logAction('[POWER] Locking workstation...');
  execFile(TSDISCON_PATH, ['1'], () => {
    execFile(TSDISCON_PATH, ['console'], () => {
      execFile(RUNDLL32_PATH, ['user32.dll,LockWorkStation']);
    });
  });
}

function executeUnlock(user = 'aliye') {
  logAction(`[POWER] Unlocking workstation session for user ${user}...`);
  exec(`for /f "tokens=3" %i in ('query session ^| findstr /i "${user}"') do tscon %i /dest:console`, (err) => {
    if (err) exec('tscon 1 /dest:console');
  });
}

function executeTerminal(command, cwd = null, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const workingDir = cwd && fs.existsSync(cwd) ? cwd : process.env.USERPROFILE || os.homedir();

    execFile(POWERSHELL_PATH, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', command
    ], {
      cwd: workingDir,
      timeout: Math.min(timeoutMs, 60000),
      maxBuffer: 10 * 1024 * 1024
    }, (err, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({
        success: exitCode === 0,
        exitCode,
        output: stdout ? stdout.toString() : '',
        error: stderr ? stderr.toString() : (err && exitCode !== 0 ? err.message : ''),
        durationMs,
        timestamp: new Date().toISOString()
      });
    });
  });
}

// -------------------------------------------------------------
// Outbound Cloudflare WebSocket Relay Client & Persistent Heartbeat
// -------------------------------------------------------------
const PAIRING_FILE = path.join(__dirname, 'pairing.json');

function loadSavedPairing() {
  try {
    if (fs.existsSync(PAIRING_FILE)) {
      return JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function savePairing(data) {
  try {
    fs.writeFileSync(PAIRING_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

const savedPair = loadSavedPairing();
let activePairCode = savedPair?.pairCode || '163860';
let activeRoomId = savedPair?.roomId || `room_${activePairCode}_pc`;
let activeToken = savedPair?.token || 'token_' + activePairCode;
let relayWs = null;
let telemetryInterval = null;
let heartbeatInterval = null;

async function registerAndConnectRelay() {
  const net = getPrimaryNetworkInfo();
  console.log(`[RELAY] Registering with Cloudflare Relay Hub: ${RELAY_URL}...`);

  try {
    const res = await fetch(`${RELAY_URL}/api/pair/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairCode: activePairCode,
        roomId: activeRoomId,
        token: activeToken,
        mac: net.mac,
        localIp: net.ip,
        hostname: os.hostname(),
        agentKey: AGENT_KEY,
        pcName: os.hostname()
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.warn('[RELAY] Registration failed:', data.error || 'Unknown error');
      setTimeout(registerAndConnectRelay, 5000);
      return;
    }

    activePairCode = data.pairCode;
    activeRoomId = data.roomId;
    activeToken = data.token;

    savePairing({
      pairCode: activePairCode,
      roomId: activeRoomId,
      token: activeToken,
      updatedAt: new Date().toISOString()
    });

    console.log(`=======================================================`);
    console.log(`🎉 6-DIGIT PAIRING CODE READY: [ ${activePairCode} ]`);
    console.log(`🔗 Dashboard Link: ${RELAY_URL}/#pair=${activePairCode}`);
    console.log(`=======================================================`);

    connectRelayWs();

    // Start periodic 15-second heartbeat registration so Cloudflare never loses the PIN
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        await fetch(`${RELAY_URL}/api/pair/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairCode: activePairCode,
            roomId: activeRoomId,
            token: activeToken,
            mac: net.mac,
            localIp: net.ip,
            hostname: os.hostname(),
            agentKey: AGENT_KEY,
            pcName: os.hostname()
          })
        });
        if (!relayWs || relayWs.readyState === WebSocket.CLOSED) {
          connectRelayWs();
        }
      } catch (e) {}
    }, 15000);

  } catch (err) {
    console.warn(`[RELAY] Connection to relay failed (${err.message}). Retrying in 5s...`);
    setTimeout(registerAndConnectRelay, 5000);
  }
}

function connectRelayWs() {
  if (!activeRoomId) return;
  if (relayWs && (relayWs.readyState === WebSocket.OPEN || relayWs.readyState === WebSocket.CONNECTING)) return;

  const wsUrl = `${RELAY_URL.replace(/^http/, 'ws')}/api/relay?room=${encodeURIComponent(activeRoomId)}&role=agent&token=${encodeURIComponent(activeToken)}`;

  try {
    relayWs = new WebSocket(wsUrl);

    relayWs.on('open', () => {
      console.log(`[RELAY-WS] Outbound WebSocket active to room [${activeRoomId}]!`);

      // Start Telemetry Broadcast Loop (every 3 seconds)
      if (telemetryInterval) clearInterval(telemetryInterval);
      telemetryInterval = setInterval(() => {
        if (relayWs && relayWs.readyState === WebSocket.OPEN) {
          relayWs.send(JSON.stringify({
            type: 'TELEMETRY',
            online: true,
            data: getTelemetryPayload()
          }));
          try { relayWs.ping(); } catch (e) {}
        }
      }, 3000);
    });

    relayWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('[RELAY-WS] Command received:', msg);

        if (msg.type === 'EXECUTE') {
          if (msg.action === 'POWER') {
            const sub = msg.subAction || msg.payload?.action;
            if (sub === 'sleep') executeSleep();
            else if (sub === 'restart') executeRestart();
            else if (sub === 'shutdown') executeShutdown();
            else if (sub === 'lock') executeLock();
            else if (sub === 'unlock') executeUnlock();
          } else if (msg.action === 'UNLOCK') {
            executeUnlock();
          } else if (msg.action === 'TERMINAL') {
            const command = msg.payload?.command || msg.command;
            const result = await executeTerminal(command);
            if (relayWs && relayWs.readyState === WebSocket.OPEN) {
              relayWs.send(JSON.stringify({
                type: 'TERMINAL_RESULT',
                reqId: msg.reqId,
                result
              }));
            }
          }
        }
      } catch (err) {
        console.error('[RELAY-WS] Error executing message:', err.message);
      }
    });

    relayWs.on('close', () => {
      console.log('[RELAY-WS] Disconnected from Cloud Relay. Reconnecting in 3s...');
      if (telemetryInterval) clearInterval(telemetryInterval);
      relayWs = null;
      setTimeout(connectRelayWs, 3000);
    });

    relayWs.on('error', (err) => {
      console.error('[RELAY-WS] Socket error:', err.message);
      try { relayWs.close(); } catch (e) {}
      relayWs = null;
    });

  } catch (err) {
    relayWs = null;
    setTimeout(connectRelayWs, 3000);
  }
}

// -------------------------------------------------------------
// Local REST Endpoints (Local Wi-Fi Access)
// -------------------------------------------------------------
app.get('/api/ping', (req, res) => {
  res.json({ status: 'online', appName: 'Nexus PC Companion Agent', version: '2.5.0' });
});

app.get('/api/pairing', (req, res) => {
  const net = getPrimaryNetworkInfo();
  res.json({
    success: true,
    pairCode: activePairCode,
    roomId: activeRoomId,
    token: activeToken,
    relayUrl: RELAY_URL,
    dashboardUrl: `${RELAY_URL}/#pair=${activePairCode}`,
    localIp: net.ip,
    mac: net.mac,
    hostname: os.hostname(),
    agentKey: AGENT_KEY
  });
});

app.post('/api/pair/claim', (req, res) => {
  const { pairCode, code } = req.body || {};
  const inputCode = (pairCode || code || '').trim().replace(/[-\s]/g, '');
  if (inputCode === activePairCode) {
    const net = getPrimaryNetworkInfo();
    return res.json({
      success: true,
      pairCode: activePairCode,
      roomId: activeRoomId,
      token: activeToken,
      targetMac: net.mac,
      targetIp: net.ip,
      hostname: os.hostname(),
      agentKey: AGENT_KEY
    });
  }
  return res.status(404).json({
    success: false,
    error: 'Invalid pairing code for this machine.'
  });
});

app.get('/api/status', authenticate, (req, res) => {
  res.json({ success: true, data: getTelemetryPayload() });
});

app.post('/api/power/sleep', authenticate, (req, res) => {
  res.json({ success: true, message: 'Initiating PC sleep mode...' });
  setTimeout(executeSleep, 300);
});

app.post('/api/power/restart', authenticate, (req, res) => {
  res.json({ success: true, message: 'Initiating PC restart...' });
  setTimeout(executeRestart, 300);
});

app.post('/api/power/shutdown', authenticate, (req, res) => {
  res.json({ success: true, message: 'Initiating PC shutdown...' });
  setTimeout(executeShutdown, 300);
});

app.post('/api/power/lock', authenticate, (req, res) => {
  res.json({ success: true, message: 'Locking workstation...' });
  setTimeout(executeLock, 300);
});

app.post('/api/power/unlock', authenticate, (req, res) => {
  res.json({ success: true, message: 'Unlocking workstation console...' });
  setTimeout(executeUnlock, 300);
});

app.post('/api/terminal/exec', authenticate, async (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'Command required' });
  const result = await executeTerminal(command, cwd);
  res.json(result);
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

app.listen(PORT, '0.0.0.0', () => {
  const net = getPrimaryNetworkInfo();
  console.log(`=======================================================`);
  console.log(`🚀 Nexus PC Companion Agent is running on port ${PORT}`);
  console.log(`Local Access:   http://localhost:${PORT}`);
  console.log(`LAN IP:         ${net.ip} (MAC: ${net.mac || 'N/A'})`);
  console.log(`Security:       Agent Key Active`);
  console.log(`=======================================================`);

  // Start cloud relay
  registerAndConnectRelay();
});
