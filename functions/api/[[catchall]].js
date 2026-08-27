// =========================================================================
// Nexus Cloud Relay & Multi-Tenant Edge Signaling Hub (Cloudflare Pages)
// =========================================================================

import { handleRequest } from '../../worker.js';

export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}
