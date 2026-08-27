const express = require('express');
const cors = require('cors');
const os = require('os');
const { exec, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 48880;
const AGENT_KEY = process.env.AGENT_KEY || '';

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

// Global Rate Limiter (Throttles brute-force or spamming)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // max 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' }
});
app.use('/api/', globalLimiter);

// Strict Rate Limiter for Power & Terminal execution
const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 40, // max 40 commands per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit exceeded for sensitive operations.' }
});
app.use('/api/power/', sensitiveActionLimiter);
app.use('/api/terminal/', sensitiveActionLimiter);

// Timing-Safe Key Comparison Helper (Prevents timing attacks)
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

  // Key must be configured and match securely
  if (!AGENT_KEY || !reqKey || !safeCompare(reqKey, AGENT_KEY)) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid or missing Agent Secret Key.' 
    });
  }
  next();
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

// Ping / Discovery Endpoint
app.get('/api/ping', (req, res) => {
  res.json({
    status: 'online',
    appName: 'Nexus PC Companion Agent',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// System Status & Telemetry Endpoint
app.get('/api/status', authenticate, (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramUsagePercent = Math.round((usedMem / totalMem) * 100);
    const cpuUsage = getCpuUsage();

    res.json({
      success: true,
      data: {
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
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

// Power: Sleep PC (Works before and after unlock)
app.post('/api/power/sleep', authenticate, (req, res) => {
  logAction(`[POWER] Sleep command received from ${req.ip}`);
  res.json({ success: true, message: 'Initiating PC sleep mode...' });

  setTimeout(() => {
    execFile(POWERSHELL_PATH, [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)'
    ], (err, stdout, stderr) => {
      if (err) {
        logAction(`[POWER] Sleep via PowerShell failed (${err.message}), trying fallback...`);
        execFile(RUNDLL32_PATH, ['powrprof.dll,SetSuspendState', '0,1,0']);
      } else {
        logAction('[POWER] Sleep command executed successfully.');
      }
    });
  }, 400);
});

// Power: Restart PC (Works before and after unlock)
app.post('/api/power/restart', authenticate, (req, res) => {
  logAction(`[POWER] Restart command received from ${req.ip}`);
  res.json({ success: true, message: 'Initiating PC restart (1s delay)...', abortAvailable: false });

  setTimeout(() => {
    execFile(SHUTDOWN_PATH, ['/r', '/t', '1'], (err, stdout, stderr) => {
      if (err) {
        logAction(`[POWER] shutdown /r failed: ${err.message}. Trying PowerShell fallback...`);
        execFile(POWERSHELL_PATH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Restart-Computer -Force']);
      } else {
        logAction('[POWER] shutdown /r /t 1 dispatched successfully.');
      }
    });
  }, 400);
});

// Power: Shutdown PC (Works before and after unlock)
app.post('/api/power/shutdown', authenticate, (req, res) => {
  logAction(`[POWER] Shutdown command received from ${req.ip}`);
  res.json({ success: true, message: 'Initiating PC shutdown (1s delay)...', abortAvailable: false });

  setTimeout(() => {
    execFile(SHUTDOWN_PATH, ['/s', '/t', '1'], (err, stdout, stderr) => {
      if (err) {
        logAction(`[POWER] shutdown /s failed: ${err.message}. Trying PowerShell fallback...`);
        execFile(POWERSHELL_PATH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Stop-Computer -Force']);
      } else {
        logAction('[POWER] shutdown /s /t 1 dispatched successfully.');
      }
    });
  }, 400);
});

// Power: Abort pending shutdown or restart
app.post('/api/power/abort', authenticate, (req, res) => {
  logAction(`[POWER] Abort command received`);
  execFile(SHUTDOWN_PATH, ['/a'], (err, stdout, stderr) => {
    if (err) {
      return res.status(400).json({ success: false, error: stderr || err.message });
    }
    res.json({ success: true, message: 'Scheduled shutdown/restart has been cancelled.' });
  });
});

// Power: Lock Workstation (Works from SYSTEM Session 0 and User Sessions)
app.post('/api/power/lock', authenticate, (req, res) => {
  logAction(`[POWER] Lock workstation command received from ${req.ip}`);
  res.json({ success: true, message: 'Workstation lock signal dispatched.' });

  setTimeout(() => {
    execFile(TSDISCON_PATH, ['1'], (err1) => {
      execFile(TSDISCON_PATH, ['console'], (err2) => {
        execFile(RUNDLL32_PATH, ['user32.dll,LockWorkStation']);
      });
    });
  }, 300);
});

// Session: Check active user session status
app.get('/api/session/status', authenticate, (req, res) => {
  exec('quser', (err, stdout) => {
    const raw = stdout ? stdout.toString() : '';
    const hasActiveSession = raw.toLowerCase().includes('active');
    const hasConsole = raw.toLowerCase().includes('console');
    res.json({
      success: true,
      hasActiveSession: hasActiveSession || hasConsole,
      sessionOutput: raw.trim(),
      timestamp: new Date().toISOString()
    });
  });
});

// Terminal: Execute Remote PowerShell / Command
app.post('/api/terminal/exec', authenticate, (req, res) => {
  const { command, cwd, timeoutMs = 25000 } = req.body;
  if (!command || typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ success: false, error: 'Command string is required.' });
  }

  logAction(`[TERMINAL] Command received: ${command.slice(0, 100)}`);
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
    
    res.json({
      success: exitCode === 0,
      exitCode,
      output: stdout ? stdout.toString() : '',
      error: stderr ? stderr.toString() : (err && exitCode !== 0 ? err.message : ''),
      durationMs,
      timestamp: new Date().toISOString()
    });
  });
});


// Webhook Relay (Protected: Requires Agent Secret Key)
app.post('/api/trigger-webhook', authenticate, async (req, res) => {
  const { url, method = 'GET', body = null } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json' }
    };
    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    res.json({ 
      success: response.ok, 
      status: response.status, 
      response: text.slice(0, 500) 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Root API info endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Nexus PC Companion API',
    version: '1.0.0'
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Nexus PC Companion Agent is running on port ${PORT}`);
  console.log(`Local Access:   http://localhost:${PORT}`);
  console.log(`Network Access: http://${getLanIp()}:${PORT}`);
  console.log(`Security:       ${AGENT_KEY ? 'Agent Key Configured (Secure)' : 'WARNING: AGENT_KEY NOT SET!'}`);
  console.log(`=======================================================`);
});

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (let dev in ifaces) {
    for (let details of ifaces[dev]) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return '127.0.0.1';
}
