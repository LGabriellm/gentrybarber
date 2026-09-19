import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

function getOrigin(incoming: Headers) {
  const origin = incoming.get('origin');
  if (origin) return origin;
  const host = incoming.get('host') || 'localhost';
  const proto = incoming.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return `${proto}://${host}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const incoming = await headers();
  const response = await fetch(new URL(path, process.env.API_URL || 'http://localhost:4000'), { headers: { cookie: incoming.get('cookie') || '' }, cache: 'no-store' });
  if (response.status === 401) redirect('/login');
  if (!response.ok) throw new Error(response.status === 403 ? 'Sua conta não possui permissão para acessar este recurso.' : response.status === 404 ? 'Recurso não encontrado para sua barbearia.' : 'Não foi possível acessar a plataforma. Verifique se a API está disponível.');
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const incoming = await headers();
  const response = await fetch(new URL(path, process.env.API_URL || 'http://localhost:4000'), { method: 'POST', headers: { cookie: incoming.get('cookie') || '', origin: getOrigin(incoming), 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', redirect: 'error' });
  if (response.status === 401) redirect('/login');
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || (response.status === 403 ? 'FORBIDDEN' : response.status === 404 ? 'NOT_FOUND' : 'API_ERROR'));
  }
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const incoming = await headers();
  const response = await fetch(new URL(path, process.env.API_URL || 'http://localhost:4000'), { method: 'PATCH', headers: { cookie: incoming.get('cookie') || '', origin: getOrigin(incoming), 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', redirect: 'error' });
  if (response.status === 401) redirect('/login');
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || (response.status === 403 ? 'FORBIDDEN' : response.status === 404 ? 'NOT_FOUND' : 'API_ERROR'));
  }
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const incoming = await headers();
  const response = await fetch(new URL(path, process.env.API_URL || 'http://localhost:4000'), { method: 'DELETE', headers: { cookie: incoming.get('cookie') || '', origin: getOrigin(incoming), 'Content-Type': 'application/json' }, cache: 'no-store', redirect: 'error' });
  if (response.status === 401) redirect('/login');
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || (response.status === 403 ? 'FORBIDDEN' : response.status === 404 ? 'NOT_FOUND' : response.status === 409 ? 'CONFLICT' : 'API_ERROR'));
  }
  return response.json() as Promise<T>;
}

const authPaths = new Set(['sign-in/email', 'sign-up/email', 'sign-out', 'get-session', 'verify-email', 'send-verification-email', 'request-password-reset', 'reset-password']);
export async function proxyAuth(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const path = incoming.pathname.replace(/^\/api\/auth\//, '');
  if (!authPaths.has(path)) return Response.json({ message: 'Not found' }, { status: 404 });
  const target = new URL(`/api/auth/${path}`, process.env.API_URL || 'http://localhost:4000');
  target.search = incoming.search;
  const forwarded = new Headers();
  for (const key of ['content-type', 'cookie', 'origin', 'user-agent']) { const value = request.headers.get(key); if (value) forwarded.set(key, value); }
  const response = await fetch(target, { method: request.method, headers: forwarded, body: request.method === 'GET' ? undefined : await request.text(), redirect: 'manual', cache: 'no-store' });
  const output = new Headers({ 'Cache-Control': 'no-store' });
  for (const key of ['content-type', 'location']) { const value = response.headers.get(key); if (value) output.set(key, value); }
  for (const cookie of response.headers.getSetCookie()) output.append('set-cookie', cookie);
  return new Response(response.body, { status: response.status, headers: output });
}
