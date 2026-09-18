import { readCatalogBody } from '../../../../lib/catalog-proxy';
import { logger } from '@platform/config';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const incoming = new URL(request.url);
  if (incoming.search) return Response.json({ message: 'Parâmetros não previstos.' }, { status: 400, headers });
  if (request.headers.get('origin') !== incoming.origin) return Response.json({ message: 'Origem não permitida.' }, { status: 403, headers });
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return Response.json({ message: 'Envie JSON.' }, { status: 415, headers });
  const result = await readCatalogBody(request);
  if ('response' in result) return result.response;
  try {
    const response = await fetch(new URL('/v1/onboarding', process.env.API_URL || 'http://localhost:4000'), {
      method: 'POST', headers: { cookie: request.headers.get('cookie') ?? '', origin: incoming.origin, 'content-type': 'application/json' },
      body: result.body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400 || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
    return Response.json(await response.json(), { status: response.status, headers });
  } catch (err) {
    logger.error('Failed to complete onboarding request', err);
    return Response.json({ message: 'Serviço indisponível. Atualize o painel antes de tentar novamente.' }, { status: 503, headers });
  }
}
