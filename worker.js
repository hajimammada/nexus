// =========================================================================
// Nexus Cloud Relay & Multi-Tenant Signaling Hub (Cloudflare Worker)
// Handles:
// 1. Zero-Configuration 6-Digit Pairing Code Exchange
// 2. Real-Time WebSocket Rooms (Clients, Satellites, PC Agents)
// 3. Static SPA Asset Serving
// =========================================================================

// In-Memory Pairing & Room Store (Global within edge isolate)
const activePairings = new Map(); // pairCode -> { mac, localIp, hostname, agentKey, roomId, token, createdAt }
const activeRooms = new Map();    // roomId -> { clients: Set, satellites: Set, agents: Set, config: Object }

// Cleanup expired pairing codes (> 15 minutes old)
function cleanExpiredPairings() {
  const now = Date.now();
  for (const [code, data] of activePairings.entries()) {
    if (now - data.createdAt > 15 * 60 * 1000) {
      activePairings.delete(code);
    }
  }
}

// Generate random 6-digit PIN string (100000 - 999999)
function generatePairCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // -------------------------------------------------------------
    // 1. CORS Preflight Handling
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // 2. 6-Digit Pairing API Endpoints
    // -------------------------------------------------------------
    cleanExpiredPairings();

    // POST /api/pair/create -> Called by PC Agent at boot/installer to register pairing code
    if (url.pathname === '/api/pair/create' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { mac = '', localIp = '', hostname = 'Nexus-PC', agentKey = '', pcName = '' } = body;
        
        let pairCode = generatePairCode();
        while (activePairings.has(pairCode)) {
          pairCode = generatePairCode();
        }

        const roomId = `room_${pairCode}_${Date.now().toString(36)}`;
        const token = crypto.randomUUID();

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
        activeRooms.set(roomId, {
          clients: new Set(),
          satellites: new Set(),
          agents: new Set(),
          config: pairData
        });

        return new Response(JSON.stringify({
          success: true,
          pairCode,
          roomId,
          token,
          expiresInSeconds: 900,
          dashboardUrl: `${url.origin}/#pair=${pairCode}`
        }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
      }
    }

    // POST /api/pair/claim -> Called by Satellite or Mobile Dashboard with 6-digit code
    if (url.pathname === '/api/pair/claim' && request.method === 'POST') {
      try {
        const body = await request.json();
        const code = (body.pairCode || body.code || '').trim().replace(/[-\s]/g, '');

        if (!code || !activePairings.has(code)) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid or expired 6-digit pairing code. Please generate a new code from your PC.'
          }), { status: 404, headers: corsHeaders });
        }

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
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 400, headers: corsHeaders });
      }
    }

    // GET /api/pair/info?room=... -> Check room status
    if (url.pathname === '/api/pair/info') {
      const roomId = url.searchParams.get('room');
      const room = activeRooms.get(roomId);
      return new Response(JSON.stringify({
        success: true,
        exists: !!room,
        agentsCount: room ? room.agents.size : 0,
        satellitesCount: room ? room.satellites.size : 0,
        clientsCount: room ? room.clients.size : 0
      }), { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // 3. Real-Time WebSocket Relay Room (/api/relay)
    // -------------------------------------------------------------
    if (url.pathname === '/api/relay') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket Upgrade', { status: 426 });
      }

      const roomId = url.searchParams.get('room') || 'default_room';
      const role = url.searchParams.get('role') || 'client'; // 'client', 'satellite', 'agent'
      const token = url.searchParams.get('token') || '';

      // Initialize room if not exists
      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, {
          clients: new Set(),
          satellites: new Set(),
          agents: new Set(),
          config: { roomId, createdAt: Date.now() }
        });
      }

      const room = activeRooms.get(roomId);
      const webSocketPair = new WebSocketPair();
      const [clientWs, serverWs] = Object.values(webSocketPair);

      serverWs.accept();

      // Register connection in role set
      if (role === 'agent') room.agents.add(serverWs);
      else if (role === 'satellite') room.satellites.add(serverWs);
      else room.clients.add(serverWs);

      // Broadcast presence state to all clients in room
      const broadcastState = () => {
        const stateMsg = JSON.stringify({
          type: 'ROOM_STATE',
          online: room.agents.size > 0,
          agentsCount: room.agents.size,
          satellitesCount: room.satellites.size,
          clientsCount: room.clients.size,
          timestamp: new Date().toISOString()
        });
        for (const c of room.clients) {
          try { c.send(stateMsg); } catch (e) {}
        }
      };

      // Notify clients of connection
      setTimeout(broadcastState, 100);

      // Message Routing
      serverWs.addEventListener('message', event => {
        try {
          const raw = event.data;
          const msg = JSON.parse(raw);

          // 1. Commands from Web Dashboard Client
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

          // 2. Telemetry, Status, or Responses from PC Agent -> Broadcast to Dashboard Clients
          if (role === 'agent' || role === 'satellite') {
            for (const c of room.clients) {
              try { c.send(raw); } catch (e) {}
            }
          }
        } catch (parseErr) {
          console.error('Relay message parse error:', parseErr);
        }
      });

      // Handle Disconnection
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

    // -------------------------------------------------------------
    // 4. Serve Dashboard Static Web Assets (Cloudflare Pages Assets)
    // -------------------------------------------------------------
    try {
      if (env.ASSETS) {
        let response = await env.ASSETS.fetch(request);
        if (response.status === 404) {
          response = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
        }
        return response;
      }
      return new Response('Nexus Dashboard Worker Online', { status: 200 });
    } catch (err) {
      return new Response(`Nexus Dashboard: ${err.message}`, { status: 500 });
    }
  }
};
