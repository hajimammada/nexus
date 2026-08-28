// =========================================================================
// Nexus Cloud Relay & Multi-Tenant Edge Signaling Hub (Cloudflare Worker)
// KV-BACKED EDITION
// =========================================================================

const activeRooms = new Map();     // roomId -> { clients: Set, satellites: Set, agents: Set, config: Object }
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
  for (const [ip, rec] of ipRateLimits.entries()) {
    if (now > rec.resetAt && now > rec.blockedUntil) {
      ipRateLimits.delete(ip);
    }
  }
}

function generatePairCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-agent-key, x-pair-code'
};

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  // Pass through non-API requests to static assets in Cloudflare Pages
  if (!url.pathname.startsWith('/api') && env && env.ASSETS && request.method === 'GET') {
    const assetRes = await env.ASSETS.fetch(request);
    if (url.pathname.includes('/download/') || url.pathname.endsWith('.apk') || url.pathname.endsWith('.zip')) {
      const newHeaders = new Headers(assetRes.headers);
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      newHeaders.set('Pragma', 'no-cache');
      newHeaders.set('Expires', '0');
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers: newHeaders
      });
    }
    return assetRes;
  }

  // CORS Preflight
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

  cleanExpiredData();

  if (!env || !env.NEXUS_KV) {
    return new Response(JSON.stringify({ success: false, error: 'KV Binding NEXUS_KV not found' }), { status: 500, headers: corsHeaders });
  }

  // 1. POST /api/pair/create or /api/pair/register
  if ((url.pathname === '/api/pair/create' || url.pathname === '/api/pair/register') && request.method === 'POST') {
    try {
      const body = await request.json();
      const { mac = '', localIp = '', hostname = 'Nexus-PC', agentKey = '', pcName = '', roomId: reqRoomId, token: reqToken, telemetry = null } = body;
      
      let pairCode = (body.pairCode || '').trim();
      
      let existing = null;
      if (pairCode) {
        existing = await env.NEXUS_KV.get(`pair:${pairCode}`, { type: 'json' });
      }
      
      if (!pairCode) {
        pairCode = generatePairCode();
        // Fallback for uniqueness checking
        while (await env.NEXUS_KV.get(`pair:${pairCode}`)) {
            pairCode = generatePairCode();
        }
      }

      existing = existing || {};

      const roomId = reqRoomId || `room_${pairCode}_${Date.now().toString(36)}`;
      const token = reqToken || crypto.randomUUID();

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

      await env.NEXUS_KV.put(`pair:${pairCode}`, JSON.stringify(pairData), { expirationTtl: 3600 }); // 1 hour TTL

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

      // Read and clear pending commands
      const queue = (await env.NEXUS_KV.get(`cmd:${pairCode}`, { type: 'json' })) || [];
      if (queue.length > 0) {
        await env.NEXUS_KV.delete(`cmd:${pairCode}`);
      }

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

  // 2. POST /api/pair/claim
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

      const data = await env.NEXUS_KV.get(`pair:${code}`, { type: 'json' });

      if (!data) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: `PIN [${code}] is not valid. Please check the PIN on your PC.` 
        }), { status: 404, headers: corsHeaders });
      }

      const hasActiveWs = activeRooms.has(data.roomId) && (activeRooms.get(data.roomId).agents.size > 0);
      const isOnline = hasActiveWs || (Date.now() - (data.lastSeen || 0)) < 25000;

      return new Response(JSON.stringify({
        success: true,
        pairCode: data.pairCode,
        roomId: data.roomId || `room_${code}_pc`,
        token: data.token || `token_${code}`,
        targetMac: data.mac || '',
        targetIp: data.localIp || '',
        hostname: data.hostname || 'Nexus-PC',
        agentKey: data.agentKey || '',
        telemetry: data.telemetry,
        online: isOnline
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 3. GET /api/pair/status?code=...
  if (url.pathname === '/api/pair/status' && request.method === 'GET') {
    const code = (url.searchParams.get('code') || '').trim();

    const data = await env.NEXUS_KV.get(`pair:${code}`, { type: 'json' });

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

  // 4. POST /api/command/dispatch
  if (url.pathname === '/api/command/dispatch' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { pairCode, action, subAction, payload = {}, reqId = Date.now().toString() } = body;
      if (!pairCode) {
        return new Response(JSON.stringify({ success: false, error: 'Pairing PIN is required' }), { status: 400, headers: corsHeaders });
      }
      const code = pairCode.trim();

      const cmdObj = { type: 'EXECUTE', action, subAction, payload, reqId, timestamp: Date.now() };

      // Try WebSocket delivery first
      const pair = await env.NEXUS_KV.get(`pair:${code}`, { type: 'json' });
      const roomId = (pair && pair.roomId) || `room_${code}_pc`;
      let wsDelivered = false;
      if (activeRooms.has(roomId)) {
        const room = activeRooms.get(roomId);
        for (const s of room.satellites) {
          try { s.send(JSON.stringify(cmdObj)); wsDelivered = true; } catch (e) {}
        }
        for (const a of room.agents) {
          try { a.send(JSON.stringify(cmdObj)); wsDelivered = true; } catch (e) {}
        }
      }

      // Write command to KV queue (Primary Delivery)
      let queue = (await env.NEXUS_KV.get(`cmd:${code}`, { type: 'json' })) || [];
      queue.push(cmdObj);
      await env.NEXUS_KV.put(`cmd:${code}`, JSON.stringify(queue), { expirationTtl: 3600 });

      // Try FCM push for WAKE actions
      let fcmResult = null;
      let fcmOk = false;
      if (action === 'WAKE' || action === 'WOL') {
        const topic = `nexus_${code}`;
        const fcmData = {
          action: action || '',
          subAction: subAction || '',
          reqId: String(reqId),
          payload: typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
        };
        fcmResult = await sendGoogleFcmPush(topic, fcmData, env);
        fcmOk = Boolean(fcmResult && fcmResult.ok);
      }

      const fcmMsg = wsDelivered
        ? `⚡ Dispatched directly via live WebSocket`
        : (fcmOk ? `WAKE Sent via Google FCM Push` : `Command queued for satellite delivery`);

      return new Response(JSON.stringify({ 
        success: true, 
        reqId, 
        fcmOk,
        dispatchedVia: wsDelivered ? 'websocket' : (fcmOk ? 'fcm' : 'queue'),
        fcm: fcmResult,
        message: fcmMsg 
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 5. GET /api/command/pending?code=...
  if (url.pathname === '/api/command/pending' && request.method === 'GET') {
    const code = (url.searchParams.get('code') || '').trim();
    const queue = (await env.NEXUS_KV.get(`cmd:${code}`, { type: 'json' })) || [];
    if (queue.length > 0) {
      await env.NEXUS_KV.delete(`cmd:${code}`);
    }
    return new Response(JSON.stringify({ success: true, commands: queue }), { headers: corsHeaders });
  }

  // 6. POST /api/command/result
  if (url.pathname === '/api/command/result' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { reqId, result, pairCode, success = true, message = '' } = body;
      if (reqId) {
        const resData = { result, success, message, timestamp: Date.now() };
        await env.NEXUS_KV.put(`result:${reqId}`, JSON.stringify(resData), { expirationTtl: 60 });
      }

      // Forward to any connected WebSocket clients
      const pair = await env.NEXUS_KV.get(`pair:${pairCode}`, { type: 'json' });
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

  // 7. GET /api/command/result?reqId=...
  if (url.pathname === '/api/command/result' && request.method === 'GET') {
    const reqId = url.searchParams.get('reqId');
    const resData = await env.NEXUS_KV.get(`result:${reqId}`, { type: 'json' });
    if (resData) {
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

          for (const s of room.satellites) {
            try { s.send(executePayload); } catch (e) {}
          }
          for (const a of room.agents) {
            try { a.send(executePayload); } catch (e) {}
          }
        }

        if (role === 'agent' || role === 'satellite') {
          for (const c of room.clients) {
            try { c.send(raw); } catch (e) {}
          }
          if (role === 'agent') {
            for (const s of room.satellites) {
              try { s.send(raw); } catch (e) {}
            }
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

  let clientEmail = env?.FCM_CLIENT_EMAIL || env?.CLIENT_EMAIL || env?.FIREBASE_CLIENT_EMAIL;
  let rawKey = env?.FCM_PRIVATE_KEY_B64 || env?.FCM_PRIVATE_KEY || env?.PRIVATE_KEY || env?.FIREBASE_PRIVATE_KEY;
  let projectId = env?.FCM_PROJECT_ID || env?.PROJECT_ID || env?.FIREBASE_PROJECT_ID || 'nexus-satellite';

  const serviceAccountJson = env?.FIREBASE_SERVICE_ACCOUNT || env?.GOOGLE_APPLICATION_CREDENTIALS || env?.FCM_SERVICE_ACCOUNT || env?.SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      const parsed = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
      if (parsed.client_email) clientEmail = parsed.client_email;
      if (parsed.private_key) rawKey = parsed.private_key;
      if (parsed.project_id) projectId = parsed.project_id;
    } catch (e) {}
  }

  if (!clientEmail || !rawKey) {
    throw new Error('FCM credentials missing.');
  }

  let cleanB64 = rawKey
    .replace(/\\n/g, '')
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
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
