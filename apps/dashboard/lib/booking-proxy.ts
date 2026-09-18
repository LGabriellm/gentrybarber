import { readCatalogBody } from './catalog-proxy';
import { logger } from '@platform/config';

export interface OperationRouteParams { slug: string; path: string[] }
const responseHeaders = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
function error(status: number, message: string) { return Response.json({ message }, { status, headers: responseHeaders }); }

function route(path: string[], method: string): Record<string, number> | null {
  const [resource, id, action] = path;
  if (path.length === 2 && resource === 'booking' && id === 'options' && method === 'GET') return {};
  if (path.length === 1) {
    if (resource === 'whatsapp' && method === 'GET') return {};
    if (resource === 'schedule') return method === 'GET' ? { locationId: 128 } : method === 'PUT' ? {} : null;
    if (resource === 'time-offs') return method === 'POST' ? {} : null;
    if (resource === 'customers') return method === 'GET' ? { q: 80, page: 6 } : method === 'POST' ? {} : null;
    if (resource === 'availability' && method === 'GET') return { locationId: 128, professionalId: 128, date: 10, serviceIds: 1289, appointmentId: 128 };
    if (resource === 'appointments') return method === 'GET' ? { locationId: 128, date: 10 } : method === 'POST' ? {} : null;
  }
  if (!id || !identifier.test(id)) return null;
  if (path.length === 3 && resource === 'whatsapp' && action === 'retry' && method === 'POST') return {};
  if (path.length === 2 && ((resource === 'time-offs' && method === 'DELETE') || (resource === 'customers' && method === 'PATCH'))) return {};
  if (path.length === 3 && resource === 'appointments' && (action === 'status' || action === 'reschedule') && method === 'POST') return {};
  return null;
}

export async function proxyOperation(request: Request, { slug, path }: OperationRouteParams): Promise<Response> {
  if (!/^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(slug) || !Array.isArray(path) || path.length > 3) return error(404, 'Recurso não encontrado.');
  const query = route(path, request.method);
  if (!query) return error(404, 'Operação não disponível.');
  const incoming = new URL(request.url);
  for (const [key, value] of incoming.searchParams) {
    if (!Object.hasOwn(query, key) || incoming.searchParams.getAll(key).length !== 1 || value.length > query[key]!) return error(400, 'Parâmetros não previstos.');
  }
  const write = request.method !== 'GET';
  const proto = request.headers.get('x-forwarded-proto') || incoming.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || incoming.host;
  if (write && request.headers.get('origin') !== `${proto}://${host}`) return error(403, 'Origem da solicitação não permitida.');
  if (write && request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return error(415, 'Envie os dados no formato JSON.');
  const forwarded = new Headers();
  for (const name of ['cookie', 'origin']) { const value = request.headers.get(name); if (value) forwarded.set(name, value); }
  let body: string | undefined;
  if (write) {
    const result = await readCatalogBody(request);
    if ('response' in result) return result.response;
    body = result.body;
    forwarded.set('content-type', 'application/json');
  }
  const target = new URL(`/v1/tenants/${encodeURIComponent(slug)}/${path.map(encodeURIComponent).join('/')}`, process.env.API_URL || 'http://localhost:4000');
  target.search = incoming.search;
  try {
    const response = await fetch(target, { method: request.method, headers: forwarded, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if ((response.status >= 300 && response.status < 400) || !response.headers.get('content-type')?.includes('application/json')) return error(503, 'O serviço está temporariamente indisponível.');
    return Response.json(await response.json(), { status: response.status, headers: responseHeaders });
  } catch (err) {
    logger.error('Failed to proxy operation request', err, { target: target.toString() });
    return error(503, 'Não foi possível acessar o serviço. Tente novamente.');
  }
}
