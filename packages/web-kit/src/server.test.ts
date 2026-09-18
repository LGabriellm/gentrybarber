import { afterEach, expect, test, vi } from 'vitest';
import { apiPost, apiPatch } from './server';

const incoming = vi.hoisted(() => ({ value: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => incoming.value }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
test.each([['POST', apiPost], ['PATCH', apiPatch]] as const)('%s preserves the browser origin and does not follow redirects with credentials', async (method, write) => {
  vi.stubEnv('API_URL', 'http://api.example.test');
  incoming.value = new Headers({ cookie: 'synthetic-session', origin: 'http://admin.example.test' });
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'created' })); vi.stubGlobal('fetch', request);
  await expect(write('/v1/admin/users', { name: 'Test' })).resolves.toEqual({ id: 'created' });
  const [url, options] = request.mock.calls[0]!;
  expect(String(url)).toBe('http://api.example.test/v1/admin/users');
  expect(options).toMatchObject({ method, redirect: 'error', headers: { origin: 'http://admin.example.test', cookie: 'synthetic-session' } });
});
test('does not invent a trusted Origin when the request has none', async () => {
  incoming.value = new Headers({ cookie: 'synthetic-session' });
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'FORBIDDEN' }, { status: 403 })); vi.stubGlobal('fetch', request);
  await expect(apiPost('/v1/admin/users', {})).rejects.toThrow('FORBIDDEN');
  expect(new Headers(request.mock.calls[0]![1]!.headers).get('origin')).toBe('');
});
