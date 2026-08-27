export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Automatically proxy all /api/ requests directly to the configured PC agent tunnel host
    if (url.pathname.startsWith('/api/')) {
      const targetHost = env.AGENT_HOST || '';
      if (!targetHost) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'AGENT_HOST environment variable is not configured on Cloudflare Worker.' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const targetUrl = new URL(url.pathname + url.search, `https://${targetHost}`);
      const modifiedHeaders = new Headers(request.headers);
      modifiedHeaders.set('Host', targetHost);

      const proxyRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: modifiedHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow'
      });

      try {
        const agentResponse = await fetch(proxyRequest);
        return agentResponse;
      } catch (err) {
        return new Response(JSON.stringify({ 
          success: false, 
          online: false, 
          error: `PC Agent tunnel offline: ${err.message}` 
        }), {
          status: 502,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // Serve static dashboard web assets
    try {
      let response = await env.ASSETS.fetch(request);
      if (response.status === 404) {
        response = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
      }
      return response;
    } catch (err) {
      return new Response(`Nexus Dashboard: ${err.message}`, { status: 500 });
    }
  }
};
