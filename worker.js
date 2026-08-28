// =========================================================================
// Nexus Cloud Relay & Multi-Tenant Edge Signaling Hub (Cloudflare Worker & Pages)
// Supports:
// 1. Zero-Configuration 6-Digit Pairing & Telemetry Cache
// 2. Real-Time WebSocket Rooms (Clients, Satellites, PC Agents)
// 3. Resilient Dual-Channel HTTP Command Dispatch & Heartbeat Polling
// =========================================================================

const activePairings = new Map();  // pairCode -> { mac, localIp, hostname, agentKey, roomId, token, telemetry, lastSeen }
const activeRooms = new Map();     // roomId -> { clients: Set, satellites: Set, agents: Set, config: Object }
const pendingCommands = new Map(); // pairCode -> Array of pending commands
const commandResults = new Map();  // reqId -> result
const ipRateLimits = new Map();    // ip -> { count: number, resetAt: number, blockedUntil: number }

function checkRateLimit(ip, maxAttempts = 15, windowMs = 60000, blockDurationMs = 180000) {
  const now = Date.now();
  let record = ipRateLimits.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs, blockedUntil: 0 };
    ipRateLimits.set(ip, record);
  }
  if (now < record.blockedUntil) {
    return false;
  }
  record.count++;
  if (record.count > maxAttempts) {
    record.blockedUntil = now + blockDurationMs;
    return false;
  }
  return true;
}

function cleanExpiredData() {
  const now = Date.now();
  for (const [code, data] of activePairings.entries()) {
    if (now - (data.lastSeen || data.createdAt) > 3600 * 1000) {
      activePairings.delete(code);
      pendingCommands.delete(code);
    }
  }
  for (const [ip, rec] of ipRateLimits.entries()) {
    if (now > rec.resetAt && now > rec.blockedUntil) {
      ipRateLimits.delete(ip);
    }
  }
}

function generatePairCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  // 1. CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-key, x-pair-code',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  cleanExpiredData();

  // 2. POST /api/pair/create or /api/pair/register (PC Agent Heartbeat & Telemetry Ingestion)
  if ((url.pathname === '/api/pair/create' || url.pathname === '/api/pair/register') && request.method === 'POST') {
    try {
      const body = await request.json();
      const { mac = '', localIp = '', hostname = 'Nexus-PC', agentKey = '', pcName = '', roomId: reqRoomId, token: reqToken, telemetry = null } = body;
      
      let pairCode = (body.pairCode || '').trim();
      if (!pairCode) {
        pairCode = generatePairCode();
        while (activePairings.has(pairCode)) {
          pairCode = generatePairCode();
        }
      }

      const roomId = reqRoomId || `room_${pairCode}_${Date.now().toString(36)}`;
      const token = reqToken || crypto.randomUUID();

      const existing = activePairings.get(pairCode) || {};

      // Automatically purge older pairings belonging to the exact same machine
      if (body.previousPairCode && body.previousPairCode !== pairCode) {
        activePairings.delete(body.previousPairCode);
        pendingCommands.delete(body.previousPairCode);
      }
      for (const [oldCode, data] of activePairings.entries()) {
        if (oldCode !== pairCode && ((agentKey && data.agentKey === agentKey) || (mac && data.mac && data.mac === mac))) {
          activePairings.delete(oldCode);
          pendingCommands.delete(oldCode);
        }
      }

      const pairData = {
        pairCode,
        roomId,
        token,
        mac: mac || existing.mac || '',
        localIp: localIp || existing.localIp || '',
        hostname: pcName || hostname || existing.hostname || 'Nexus-PC',
        agentKey: agentKey || existing.agentKey || '',
        telemetry: telemetry || existing.telemetry || null,
        createdAt: existing.createdAt || Date.now(),
        lastSeen: Date.now()
      };

      activePairings.set(pairCode, pairData);
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, {
          clients: new Set(),
          satellites: new Set(),
          agents: new Set(),
          config: pairData
        });
      } else {
        activeRooms.get(roomId).config = pairData;
      }

      // Check if there are pending commands to deliver directly to the agent in HTTP response
      const queue = pendingCommands.get(pairCode) || [];
      pendingCommands.set(pairCode, []);

      return new Response(JSON.stringify({
        success: true,
        pairCode,
        roomId,
        token,
        commands: queue,
        expiresInSeconds: 3600,
        dashboardUrl: `${url.origin}/#pair=${pairCode}`
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 3. POST /api/pair/claim (Phone or Dashboard pairing - ZERO FAIL FALLBACK)
  if (url.pathname === '/api/pair/claim' && request.method === 'POST') {
    try {
      const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
      if (!checkRateLimit(clientIp, 15, 60000, 180000)) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Too many failed claim attempts. Rate limit exceeded. Please wait 3 minutes.' 
        }), { status: 429, headers: corsHeaders });
      }

      const body = await request.json();
      const code = (body.pairCode || body.code || '').trim().replace(/[-\s]/g, '');

      if (!code) {
        return new Response(JSON.stringify({ success: false, error: 'Pairing code required' }), { status: 400, headers: corsHeaders });
      }

      let data = activePairings.get(code);
      if (!data) {
        // Deterministic Self-Healing: Reconstruct room from PIN
        const roomId = `room_${code}_pc`;
        const token = `token_${code}`;
        const room = activeRooms.get(roomId);
        data = room?.config || {
          pairCode: code,
          roomId,
          token,
          mac: '',
          localIp: '',
          hostname: 'Nexus-PC',
          agentKey: '',
          telemetry: null,
          lastSeen: Date.now()
        };
        activePairings.set(code, data);
      }

      const hasActiveWs = activeRooms.has(data.roomId) && (activeRooms.get(data.roomId).agents.size > 0);
      const isOnline = hasActiveWs || (Date.now() - (data.lastSeen || 0)) < 25000;

      return new Response(JSON.stringify({
        success: true,
        pairCode: data.pairCode,
        roomId: data.roomId,
        token: data.token,
        targetMac: data.mac,
        targetIp: data.localIp,
        hostname: data.hostname,
        agentKey: data.agentKey,
        telemetry: data.telemetry,
        online: isOnline
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 4. GET /api/pair/status?code=... (Dashboard HTTP Status Polling Fallback)
  if (url.pathname === '/api/pair/status' && request.method === 'GET') {
    const code = (url.searchParams.get('code') || '').trim();
    let data = activePairings.get(code);
    if (!data && code.length >= 6) {
      const roomId = `room_${code}_pc`;
      if (activeRooms.has(roomId)) {
        data = activeRooms.get(roomId).config;
      }
    }

    if (data) {
      const hasActiveWs = activeRooms.has(data.roomId) && (activeRooms.get(data.roomId).agents.size > 0);
      const isOnline = hasActiveWs || (Date.now() - (data.lastSeen || 0)) < 25000;
      return new Response(JSON.stringify({
        success: true,
        online: isOnline,
        isOnline: isOnline,
        hostname: data.hostname,
        targetIp: data.localIp,
        targetMac: data.mac,
        telemetry: data.telemetry,
        lastSeenAgoSeconds: Math.round((Date.now() - (data.lastSeen || 0)) / 1000)
      }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: false, online: false, isOnline: false, error: 'PC not found or unregistered' }), { status: 404, headers: corsHeaders });
  }

  // 5. POST /api/command/dispatch (Send command from Dashboard to Android Satellite Gateway via FCM Push + Edge)
  if (url.pathname === '/api/command/dispatch' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { pairCode, action, subAction, payload = {}, reqId = Date.now().toString() } = body;
      if (!pairCode) {
        return new Response(JSON.stringify({ success: false, error: 'Pairing PIN is required' }), { status: 400, headers: corsHeaders });
      }
      const code = pairCode.trim();

      const cmdObj = { type: 'EXECUTE', action, subAction, payload, reqId, timestamp: Date.now() };

      // 1. Instant High-Priority Google Firebase Push Notification (FCM v1)
      const topic = `nexus_${code}`;
      const fcmData = {
        action: action || '',
        subAction: subAction || '',
        reqId: String(reqId),
        payload: typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
      };
      
      const fcmResult = await sendGoogleFcmPush(topic, fcmData, env);

      // 2. Send via WebSocket if satellite or agent is connected to this isolate
      const pair = activePairings.get(code);
      if (pair && pair.roomId && activeRooms.has(pair.roomId)) {
        const room = activeRooms.get(pair.roomId);
        for (const s of room.satellites) {
          try { s.send(JSON.stringify(cmdObj)); } catch (e) {}
        }
        for (const a of room.agents) {
          try { a.send(JSON.stringify(cmdObj)); } catch (e) {}
        }
      }

      // 3. Queue into pendingCommands for HTTP retrieval by Android Satellite
      if (!pendingCommands.has(code)) pendingCommands.set(code, []);
      pendingCommands.get(code).push(cmdObj);

      const fcmOk = fcmResult && fcmResult.ok;
      const fcmMsg = fcmOk
        ? `Google FCM Push Sent to [${topic}]`
        : `Google FCM Error: ${fcmResult ? (fcmResult.error || JSON.stringify(fcmResult.data?.error || fcmResult)) : 'Unknown'}`;

      return new Response(JSON.stringify({ 
        success: fcmOk, 
        reqId, 
        fcm: fcmResult,
        message: fcmMsg 
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 5b. GET /api/command/pending?code=... (Android Satellite polls for queued commands)
  if (url.pathname === '/api/command/pending' && request.method === 'GET') {
    const code = (url.searchParams.get('code') || '').trim();
    const queue = pendingCommands.get(code) || [];
    pendingCommands.set(code, []);
    return new Response(JSON.stringify({ success: true, commands: queue }), { headers: corsHeaders });
  }

  // 6. POST /api/command/result (Android Satellite or PC Agent posts execution result)
  if (url.pathname === '/api/command/result' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { reqId, result, pairCode, success = true, message = '' } = body;
      if (reqId) commandResults.set(reqId, { result, success, message, timestamp: Date.now() });

      // Forward to any connected WebSocket clients
      const pair = activePairings.get(pairCode);
      if (pair && pair.roomId && activeRooms.has(pair.roomId)) {
        const room = activeRooms.get(pair.roomId);
        for (const c of room.clients) {
          try { c.send(JSON.stringify({ type: 'ACTION_RESPONSE', reqId, success, message, result })); } catch (e) {}
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 7. GET /api/command/result?reqId=... (Dashboard retrieves execution result)
  if (url.pathname === '/api/command/result' && request.method === 'GET') {
    const reqId = url.searchParams.get('reqId');
    if (commandResults.has(reqId)) {
      const resData = commandResults.get(reqId);
      return new Response(JSON.stringify({ success: true, result: resData.result, message: resData.message, isSuccess: resData.success }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: false, pending: true }), { headers: corsHeaders });
  }

  // 8. WebSocket Relay (/api/relay)
  if (url.pathname === '/api/relay') {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', { status: 426 });
    }

    const roomId = url.searchParams.get('room') || 'default_room';
    const role = url.searchParams.get('role') || 'client';

    if (!activeRooms.has(roomId)) {
      activeRooms.set(roomId, {
        clients: new Set(),
        satellites: new Set(),
        agents: new Set(),
        config: {}
      });
    }

    const room = activeRooms.get(roomId);
    const webSocketPair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(webSocketPair);

    serverWs.accept();

    if (role === 'agent') room.agents.add(serverWs);
    else if (role === 'satellite') room.satellites.add(serverWs);
    else room.clients.add(serverWs);

    const broadcastState = () => {
      const isOnline = room.agents.size > 0 || room.satellites.size > 0;
      const statePayload = JSON.stringify({
        type: 'ROOM_STATE',
        roomId,
        online: isOnline,
        isOnline: isOnline,
        agentsCount: room.agents.size,
        satellitesCount: room.satellites.size,
        clientsCount: room.clients.size,
        timestamp: new Date().toISOString()
      });
      for (const c of room.clients) {
        try { c.send(statePayload); } catch (e) {}
      }
    };

    setTimeout(broadcastState, 100);

    serverWs.addEventListener('message', event => {
      try {
        const raw = event.data;
        const msg = JSON.parse(raw);

        if (role === 'client') {
          const executePayload = JSON.stringify({
            type: 'EXECUTE',
            action: msg.action,
            subAction: msg.subAction,
            payload: msg.payload || {},
            reqId: msg.reqId || Date.now().toString()
          });

          // Forward to ALL Satellites (Local LAN Wi-Fi Gateways)
          for (const s of room.satellites) {
            try { s.send(executePayload); } catch (e) {}
          }
          // Forward to direct PC Agents
          for (const a of room.agents) {
            try { a.send(executePayload); } catch (e) {}
          }
        }

        if (role === 'agent' || role === 'satellite') {
          for (const c of room.clients) {
            try { c.send(raw); } catch (e) {}
          }
        }
      } catch (parseErr) {
        console.error('Relay message parse error:', parseErr);
      }
    });

    serverWs.addEventListener('close', () => {
      if (role === 'agent') room.agents.delete(serverWs);
      else if (role === 'satellite') room.satellites.delete(serverWs);
      else room.clients.delete(serverWs);
      broadcastState();
    });

    return new Response(null, {
      status: 101,
      webSocket: clientWs
    });
  }

  // Fallback to static assets
  if (env && env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response(JSON.stringify({ status: 'Nexus Cloud Relay Online' }), { headers: corsHeaders });
}

// =========================================================================
// Google Firebase Cloud Messaging (FCM v1) High-Priority Dispatch Engine
// =========================================================================
let cachedGoogleToken = null;
let tokenExpiresAt = 0;

function b64ToUint8Array(b64) {
  const raw = atob(b64);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  return u8;
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && now < tokenExpiresAt - 60) {
    return cachedGoogleToken;
  }

  const clientEmail = env?.FCM_CLIENT_EMAIL;
  const rawKey = env?.FCM_PRIVATE_KEY_B64 || env?.FCM_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    throw new Error('FCM credentials missing. Please set FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY_B64 in Cloudflare Worker Secrets.');
  }

  const cleanB64 = rawKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');

  const u8 = b64ToUint8Array(cleanB64);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    u8.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claim = btoa(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const encodedData = new TextEncoder().encode(`${header}.${claim}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encodedData);
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${header}.${claim}.${sigBase64}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await resp.json();
  if (data.access_token) {
    cachedGoogleToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600);
    return cachedGoogleToken;
  }
  throw new Error('Failed to acquire Google OAuth2 Token: ' + JSON.stringify(data));
}

async function sendGoogleFcmPush(topic, dataPayload, env) {
  try {
    const projectId = env?.FCM_PROJECT_ID || "nexus-satellite";
    const token = await getGoogleAccessToken(env);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          topic: topic,
          data: dataPayload,
          android: {
            priority: 'HIGH'
          }
        }
      })
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  } catch (err) {
    console.error('FCM Push Error:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
};

