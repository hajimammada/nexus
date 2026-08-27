// =========================================================================
// Nexus Cloud Relay & Multi-Tenant Signaling Hub (Cloudflare Pages Function)
// Handles:
// 1. Zero-Configuration 6-Digit Pairing Code Exchange
// 2. Real-Time WebSocket Rooms (Clients, Satellites, PC Agents)
// =========================================================================

const activePairings = new Map(); // pairCode -> { mac, localIp, hostname, agentKey, roomId, token, createdAt }
const activeRooms = new Map();    // roomId -> { clients: Set, satellites: Set, agents: Set, config: Object }

function cleanExpiredPairings() {
  const now = Date.now();
  for (const [code, data] of activePairings.entries()) {
    if (now - data.createdAt > 3600 * 1000) {
      activePairings.delete(code);
    }
  }
}

function generatePairCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function onRequest(context) {
  const { request, env } = context;
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

  cleanExpiredPairings();

  // 2. POST /api/pair/create or /api/pair/register
  if ((url.pathname === '/api/pair/create' || url.pathname === '/api/pair/register') && request.method === 'POST') {
    try {
      const body = await request.json();
      const { mac = '', localIp = '', hostname = 'Nexus-PC', agentKey = '', pcName = '', roomId: reqRoomId, token: reqToken } = body;
      
      let pairCode = (body.pairCode || '').trim();
      if (!pairCode) {
        pairCode = generatePairCode();
        while (activePairings.has(pairCode)) {
          pairCode = generatePairCode();
        }
      }

      const roomId = reqRoomId || `room_${pairCode}_${Date.now().toString(36)}`;
      const token = reqToken || crypto.randomUUID();

      const pairData = {
        pairCode,
        roomId,
        token,
        mac,
        localIp,
        hostname: pcName || hostname,
        agentKey,
        createdAt: Date.now()
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

      return new Response(JSON.stringify({
        success: true,
        pairCode,
        roomId,
        token,
        expiresInSeconds: 3600,
        dashboardUrl: `${url.origin}/#pair=${pairCode}`
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 3. POST /api/pair/claim
  if (url.pathname === '/api/pair/claim' && request.method === 'POST') {
    try {
      const body = await request.json();
      const code = (body.pairCode || body.code || '').trim().replace(/[-\s]/g, '');

      if (!code) {
        return new Response(JSON.stringify({ success: false, error: 'Pairing code required' }), { status: 400, headers: corsHeaders });
      }

      if (activePairings.has(code)) {
        const data = activePairings.get(code);
        return new Response(JSON.stringify({
          success: true,
          pairCode: data.pairCode,
          roomId: data.roomId,
          token: data.token,
          targetMac: data.mac,
          targetIp: data.localIp,
          hostname: data.hostname,
          agentKey: data.agentKey
        }), { headers: corsHeaders });
      }

      // Zero-Config Deterministic Claim Fallback
      return new Response(JSON.stringify({
        success: true,
        pairCode: code,
        roomId: `room_${code}_pc`,
        token: `token_${code}`,
        targetMac: '',
        targetIp: '',
        hostname: 'Nexus-PC',
        agentKey: ''
      }), { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
    }
  }

  // 4. WebSocket Relay (/api/relay)
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
      const statePayload = JSON.stringify({
        type: 'ROOM_STATE',
        roomId,
        online: room.agents.size > 0,
        isOnline: room.agents.size > 0,
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
          if (msg.action === 'WAKE') {
            for (const s of room.satellites) {
              try { s.send(JSON.stringify({ type: 'EXECUTE', action: 'WAKE', payload: msg.payload })); } catch (e) {}
            }
          } else if (msg.action === 'UNLOCK') {
            for (const s of room.satellites) {
              try { s.send(JSON.stringify({ type: 'EXECUTE', action: 'UNLOCK', payload: msg.payload })); } catch (e) {}
            }
            for (const a of room.agents) {
              try { a.send(JSON.stringify({ type: 'EXECUTE', action: 'UNLOCK', payload: msg.payload })); } catch (e) {}
            }
          } else if (msg.action === 'POWER' || msg.action === 'TERMINAL') {
            for (const a of room.agents) {
              try { a.send(JSON.stringify({ type: 'EXECUTE', action: msg.action, subAction: msg.subAction, payload: msg.payload, reqId: msg.reqId })); } catch (e) {}
            }
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

  return new Response(JSON.stringify({ status: 'Nexus API Function Online' }), { headers: corsHeaders });
}
