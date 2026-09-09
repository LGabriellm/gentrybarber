import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyOperation } from './booking-proxy';

const origin = 'http://localhost:3001';
function request(path: string, method = 'GET', headers: HeadersInit = {}, body = '{}') {
  return new Request(`${origin}/api/operations/imperial/${path}`, {
    method, headers: { origin, 'content-type': 'application/json', cookie: 'session=fixture', ...headers },
    ...(method === 'GET' ? {} : { body }),
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('operational proxy boundary', () => {
  it('rejects unknown paths, actions, methods and query authority before forwarding cookies', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const [path, method] of [['../admin', 'GET'], ['customers', 'DELETE'], ['appointments/id/delete', 'POST'], ['booking/options/extra', 'GET']]) {
      expect((await proxyOperation(request(path!, method!), { slug: 'imperial', path: path!.split('/') })).status).toBe(404);
    }
    for (const query of ['tenantId=other', 'locationId=a&locationId=b', `locationId=${'a'.repeat(129)}`]) {
      expect((await proxyOperation(request(`schedule?${query}`), { slug: 'imperial', path: ['schedule'] })).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects foreign or missing origins on every supported write method', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const [path, method] of [['appointments', 'POST'], ['schedule', 'PUT'], ['customers/id', 'PATCH'], ['time-offs/id', 'DELETE']]) {
      for (const value of ['', 'https://untrusted.example.test']) {
        expect((await proxyOperation(request(path!, method!, { origin: value }), { slug: 'imperial', path: path!.split('/') })).status).toBe(403);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-JSON and oversized writes before reaching the API', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const params = { slug: 'imperial', path: ['appointments'] };
    expect((await proxyOperation(request('appointments', 'POST', { 'content-type': 'text/plain' }), params)).status).toBe(415);
    expect((await proxyOperation(request('appointments', 'POST', {}, JSON.stringify({ notes: 'a'.repeat(32_768) })), params)).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only session and origin to the configured API and preserves conflicts without caching', async () => {
    vi.stubEnv('API_URL', 'http://127.0.0.1:4000');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: 'CONFLICT' }, { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyOperation(request('schedule', 'PUT', { authorization: 'untrusted', 'x-tenant-id': 'other' }), { slug: 'imperial', path: ['schedule'] });
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:4000/v1/tenants/imperial/schedule');
    expect(Object.fromEntries(init.headers)).toEqual({ cookie: 'session=fixture', origin, 'content-type': 'application/json' });
    expect(init).toMatchObject({ method: 'PUT', redirect: 'manual', cache: 'no-store' });
  });

  it('does not follow redirects or expose non-JSON upstream responses', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const upstream of [new Response(null, { status: 302, headers: { location: 'https://untrusted.example.test' } }), new Response('private upstream details', { status: 500 })]) {
      fetchMock.mockResolvedValueOnce(upstream);
      const response = await proxyOperation(request('booking/options'), { slug: 'imperial', path: ['booking', 'options'] });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private upstream details');
    }
  });
});
