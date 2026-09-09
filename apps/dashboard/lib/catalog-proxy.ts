const resources = new Set(['services', 'professionals', 'locations']);
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

export interface CatalogRouteParams { slug: string; resource: string; id?: string[] }

function error(status: number, message: string): Response {
  return Response.json({ message }, { status, headers });
}

export async function readCatalogBody(request: Request): Promise<{ body: string } | { response: Response }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cancel: (() => void) | undefined;
  try {
    reader = request.body?.getReader();
    if (!reader) return { response: error(400, 'Dados inválidos.') };
    const activeReader = reader;
    cancel = () => { void activeReader.cancel().catch(() => undefined); };
    request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) {
      cancel();
      return { response: error(400, 'Solicitação interrompida.') };
    }
    const bytes = new Uint8Array(32_768);
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (request.signal.aborted) return { response: error(400, 'Solicitação interrompida.') };
      if (chunk.done) break;
      if (length + chunk.value.byteLength > bytes.byteLength) {
        cancel();
        return { response: error(413, 'Dados acima do limite permitido.') };
      }
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    JSON.parse(body);
    return { body };
  } catch {
    cancel?.();
    return { response: error(400, 'Dados inválidos.') };
  } finally {
    if (cancel) request.signal.removeEventListener('abort', cancel);
    reader?.releaseLock();
  }
}

export async function proxyCatalog(request: Request, params: CatalogRouteParams): Promise<Response> {
  const { slug, resource, id = [] } = params;
  if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/.test(slug) || !resources.has(resource) || id.length > 1 || id.some(value => !/^[a-zA-Z0-9_-]{1,128}$/.test(value))) {
    return error(404, 'Recurso não encontrado.');
  }
  const write = request.method === 'POST' || request.method === 'PATCH';
  if ((!write && request.method !== 'GET') || (request.method === 'PATCH' ? id.length !== 1 : id.length !== 0)) {
    return error(405, 'Método não permitido.');
  }
  if (new URL(request.url).search) return error(400, 'Parâmetros não previstos.');
  if (write && request.headers.get('origin') !== new URL(request.url).origin) {
    return error(403, 'Origem da solicitação não permitida.');
  }
  if (write && request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return error(415, 'Envie os dados no formato JSON.');
  }
  const forwarded = new Headers();
  for (const name of ['cookie', 'origin']) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  let body: string | undefined;
  if (write) {
    const result = await readCatalogBody(request);
    if ('response' in result) return result.response;
    body = result.body;
    forwarded.set('content-type', 'application/json');
  }
  const path = `/v1/tenants/${encodeURIComponent(slug)}/${resource}${id[0] ? '/' + encodeURIComponent(id[0]) : ''}`;
  try {
    const response = await fetch(new URL(path, process.env.API_URL || 'http://localhost:4000'), {
      method: request.method, headers: forwarded, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) return error(503, 'O serviço está temporariamente indisponível.');
    const data: unknown = await response.json();
    if (response.status >= 300 && response.status < 400) return error(503, 'O serviço está temporariamente indisponível.');
    return Response.json(data, { status: response.status, headers });
  } catch {
    return error(503, 'Não foi possível acessar o serviço. Tente novamente.');
  }
}
