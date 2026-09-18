import type { NextRequest } from 'next/server';
import { logger } from '@platform/config';

async function forward(request: NextRequest, params: Promise<{ resource: string }>) {
  const { resource } = await params;
  const allowed = request.method === 'GET' ? ['options', 'availability'] : ['appointments'];
  const failure = (status: number) => Response.json({ error: 'INVALID_REQUEST' }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!allowed.includes(resource)) return failure(404);
  const hostname = request.headers.get('host');
  if (!hostname || !/^[a-zA-Z0-9.:-]+$/.test(hostname)) return failure(400);
  const target = new URL(`/v1/public/booking/${resource}`, process.env.API_URL || 'http://localhost:4000');
  let body: string | undefined;
  if (request.method === 'POST') {
    // Next can construct request.url with the internal server hostname; bind Origin to the same public Host used for tenant resolution.
    let publicOrigin: string;
    try { publicOrigin = new URL(`${request.nextUrl.protocol}//${hostname}`).origin; } catch (err) {
      logger.error('Invalid public origin', err, { hostname });
      return failure(400);
    }
    if (request.headers.get('origin') !== publicOrigin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') || request.nextUrl.search) return failure(403);
    const reader = request.body?.getReader(); if (!reader) return failure(400);
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength; if (length > 32768) { await reader.cancel(); return failure(413); } chunks.push(chunk.value); }
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const input = JSON.parse(new TextDecoder().decode(bytes));
      if (!input || typeof input !== 'object' || Array.isArray(input) || 'hostname' in input) return failure(400);
      body = JSON.stringify({ ...input, hostname });
    } catch (err) {
      logger.error('Failed to parse booking request payload', err);
      return failure(400);
    }
  } else {
    const keys = resource === 'availability' ? ['locationId', 'professionalId', 'serviceIds', 'date'] : [];
    for (const [key, value] of request.nextUrl.searchParams) { if (!keys.includes(key) || target.searchParams.has(key)) return failure(400); target.searchParams.set(key, value); }
    target.searchParams.set('hostname', hostname);
  }
  try {
    const response = await fetch(target, { method: request.method, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: body ? { 'content-type': 'application/json' } : {} });
    if (response.status >= 300 && response.status < 400) return failure(502);
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (err) {
    logger.error('Failed to proxy public booking request', err, { target: target.toString() });
    return failure(503);
  }
}
export function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) { return forward(request, context.params); }
export function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) { return forward(request, context.params); }
