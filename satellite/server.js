const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const { exec } = require('child_process');
const WebSocket = require('ws');

const PORT = process.env.PORT || 5050;
const CONFIG_FILE = path.join(__dirname, 'satellite_config.json');

// Default Config
let config = {
  relayUrl: 'https://nexus.hajimammad.com',
  roomId: '',
  token: '',
  targetMac: '',
  targetIp: '',
  hostname: '',
  paired: false,
  pairedAt: null
};

// Load saved config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = { ...config, ...data };
      console.log(`[SATELLITE] Loaded config: Room=${config.roomId}, Target MAC=${config.targetMac}`);
    }
  } catch (err) {
    console.error('[SATELLITE] Error loading config:', err.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[SATELLITE] Error saving config:', err.message);
  }
}

loadConfig();

// -------------------------------------------------------------
// 1. Wake-on-LAN (UDP Magic Packet Broadcaster)
// -------------------------------------------------------------
function sendWakeOnLan(macAddress) {
  return new Promise((resolve, reject) => {
    if (!macAddress) return reject(new Error('Target MAC address is empty.'));
    
    // Normalize MAC address string
    const cleanMac = macAddress.replace(/[^0-9A-Fa-f]/g, '');
    if (cleanMac.length !== 12) {
      return reject(new Error(`Invalid MAC address format: ${macAddress}`));
    }

    const macBytes = Buffer.from(cleanMac, 'hex');
    const magicPacket = Buffer.alloc(102);

    // 6 bytes of 0xFF
    magicPacket.fill(0xff, 0, 6);

    // 16 repetitions of target MAC bytes
    for (let i = 0; i < 16; i++) {
      macBytes.copy(magicPacket, 6 + i * 6, 0, 6);
    }

    const client = dgram.createSocket('udp4');

    client.on('error', (err) => {
      client.close();
      reject(err);
    });

    client.bind(0, () => {
      client.setBroadcast(true);

      // Send to standard broadcast 255.255.255.255
      client.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', (err) => {
        if (err) console.warn('[WOL] Error broadcasting to 255.255.255.255:', err.message);
      });

      // Also send to port 7 as fallback
      client.send(magicPacket, 0, magicPacket.length, 7, '255.255.255.255', (err) => {
        client.close();
        if (err) return reject(err);
        console.log(`[WOL] Magic packet broadcasted successfully for ${macAddress}`);
        resolve({ success: true, mac: macAddress });
      });
    });
  });
}

// -------------------------------------------------------------
// 2. OpenSSH Windows Unlock Executor
// -------------------------------------------------------------
function sendSshUnlock(targetIp, user = 'aliye') {
  return new Promise((resolve, reject) => {
    if (!targetIp) return reject(new Error('Target IP is not configured.'));

    // Command runs session attach tscon
    const cmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${targetIp} "for /f \\"tokens=3\\" %i in ('query session ^| findstr /i \\"${user}\\"') do tscon %i /dest:console"`;

    console.log(`[SSH] Dispatching unlock to ${user}@${targetIp}...`);
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        console.warn(`[SSH] Unlock command error (${err.message}). Trying fallback tscon 1...`);
        const fallbackCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${targetIp} "tscon 1 /dest:console"`;
        exec(fallbackCmd, { timeout: 8000 }, (err2) => {
          if (err2) return reject(new Error(`SSH Unlock failed: ${err2.message}`));
          resolve({ success: true, message: 'Unlocked via session 1 fallback' });
        });
      } else {
        console.log('[SSH] Unlock command dispatched successfully.');
        resolve({ success: true, output: stdout });
      }
    });
  });
}

// -------------------------------------------------------------
// 3. Real-Time Cloudflare WebSocket Client
// -------------------------------------------------------------
let ws = null;
let wsConnected = false;
let reconnectTimer = null;

function connectToRelay() {
  if (!config.paired || !config.roomId) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const baseRelay = (config.relayUrl || 'https://nexus.hajimammad.com').replace(/\/$/, '');
  const wsUrl = `${baseRelay.replace(/^http/, 'ws')}/api/relay?room=${encodeURIComponent(config.roomId)}&role=satellite&token=${encodeURIComponent(config.token || '')}`;

  console.log(`[RELAY] Connecting to Cloud Relay: ${wsUrl}`);

  try {
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      wsConnected = true;
      console.log(`[RELAY] Connected to Cloudflare Relay Room [${config.roomId}]!`);
      ws.send(JSON.stringify({
        type: 'SATELLITE_ONLINE',
        hostname: require('os').hostname(),
        targetMac: config.targetMac,
        targetIp: config.targetIp
      }));
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[RELAY] Received command:`, msg);

        if (msg.type === 'EXECUTE') {
          if (msg.action === 'WAKE') {
            console.log(`[RELAY] Triggering Wake-on-LAN for PC (${config.targetMac})...`);
            try {
              await sendWakeOnLan(config.targetMac);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ACTION_RESPONSE',
                  action: 'WAKE',
                  success: true,
                  message: `Magic packet broadcasted to ${config.targetMac} on local LAN.`
                }));
              }
            } catch (err) {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ACTION_RESPONSE', action: 'WAKE', success: false, error: err.message }));
              }
            }
          } else if (msg.action === 'UNLOCK') {
            console.log(`[RELAY] Triggering OpenSSH Unlock for PC (${config.targetIp})...`);
            try {
              await sendSshUnlock(config.targetIp);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ACTION_RESPONSE',
                  action: 'UNLOCK',
                  success: true,
                  message: `Unlock signal dispatched to ${config.targetIp}.`
                }));
              }
            } catch (err) {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ACTION_RESPONSE', action: 'UNLOCK', success: false, error: err.message }));
              }
            }
          }
        }
      } catch (err) {
        console.error('[RELAY] Message handling error:', err.message);
      }
    });

    ws.on('close', () => {
      wsConnected = false;
      console.log('[RELAY] Disconnected from Cloud Relay. Reconnecting in 5s...');
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      wsConnected = false;
      console.error('[RELAY] WebSocket Error:', err.message);
      ws.close();
    });
  } catch (err) {
    console.error('[RELAY] Failed to instantiate WebSocket:', err.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectToRelay, 5000);
}

// Start connection if already paired
if (config.paired) {
  connectToRelay();
}

// -------------------------------------------------------------
// 4. Local Web UI & Pairing REST API (Port 5050)
// -------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    paired: config.paired,
    roomId: config.roomId || '',
    targetMac: config.targetMac || '',
    targetIp: config.targetIp || '',
    hostname: config.hostname || '',
    relayUrl: config.relayUrl,
    cloudConnected: wsConnected,
    localPort: PORT,
    timestamp: new Date().toISOString()
  });
});

// POST /api/pair -> Claims 6-digit code from Cloudflare Worker
app.post('/api/pair', async (req, res) => {
  const { pairCode, relayUrl = 'https://nexus.hajimammad.com' } = req.body;
  if (!pairCode) return res.status(400).json({ success: false, error: '6-Digit Pairing code is required.' });

  const cleanCode = pairCode.toString().trim().replace(/[-\s]/g, '');
  const baseRelay = relayUrl.replace(/\/$/, '');

  try {
    console.log(`[PAIR] Claiming 6-digit code [${cleanCode}] at ${baseRelay}/api/pair/claim...`);
    const claimRes = await fetch(`${baseRelay}/api/pair/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairCode: cleanCode })
    });

    const data = await claimRes.json();
    if (!claimRes.ok || !data.success) {
      return res.status(400).json({ success: false, error: data.error || 'Failed to claim pairing code.' });
    }

    // Save pairing
    config = {
      ...config,
      relayUrl: baseRelay,
      roomId: data.roomId,
      token: data.token,
      targetMac: data.targetMac,
      targetIp: data.targetIp,
      hostname: data.hostname,
      agentKey: data.agentKey,
      paired: true,
      pairedAt: new Date().toISOString()
    };
    saveConfig();

    // Reconnect to Cloud Relay
    if (ws) ws.close();
    connectToRelay();

    res.json({ success: true, message: 'Successfully paired with PC!', data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: `Pairing failed: ${err.message}` });
  }
});

app.post('/api/unpair', (req, res) => {
  if (ws) ws.close();
  config = {
    relayUrl: 'https://nexus.hajimammad.com',
    roomId: '',
    token: '',
    targetMac: '',
    targetIp: '',
    hostname: '',
    paired: false,
    pairedAt: null
  };
  saveConfig();
  res.json({ success: true, message: 'Satellite un-paired successfully.' });
});

app.post('/api/test/wake', async (req, res) => {
  try {
    const result = await sendWakeOnLan(config.targetMac);
    res.json({ success: true, message: `Wake-on-LAN magic packet sent to ${config.targetMac}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/test/unlock', async (req, res) => {
  try {
    const result = await sendSshUnlock(config.targetIp);
    res.json({ success: true, message: `SSH unlock signal sent to ${config.targetIp}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`📡 Nexus Satellite (Home Relay) is running on port ${PORT}`);
  console.log(`Local Web UI:  http://localhost:${PORT}`);
  console.log(`Relay Status:  ${config.paired ? 'PAIRED & ACTIVE' : 'UNPAIRED (Waiting for 6-Digit PIN)'}`);
  console.log(`=======================================================`);
});
