import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyCatalog } from './catalog-proxy';

const params = { slug: 'imperial', resource: 'services' };
function request(body: BodyInit, signal?: AbortSignal): Request {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', headers: { origin: 'http://localhost:3001', 'content-type': 'application/json' },
    body, duplex: 'half', signal,
  };
  return new Request('http://localhost:3001/api/tenants/imperial/services', init);
}
function upstream() {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'service-created' }, { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('catalog proxy body limits', () => {
  it('cancels an oversized stream before consuming the entire upload, without Content-Length', async () => {
    const fetchMock = upstream();
    const cancelled = vi.fn();
    let chunksRead = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunksRead < 8) {
          chunksRead++;
          controller.enqueue(new Uint8Array(16_384).fill(32));
        } else controller.close();
      },
      cancel: cancelled,
    });
    const response = await proxyCatalog(request(stream), params);
    expect(response.status).toBe(413);
    expect(chunksRead).toBeLessThan(8);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 32 KiB and decodes a multibyte character split between chunks', async () => {
    const fetchMock = upstream();
    const body = JSON.stringify({ name: 'a' + 'é'.repeat(16_378) });
    const bytes = new TextEncoder().encode(body);
    expect(bytes.byteLength).toBe(32_768);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 11));
        controller.enqueue(bytes.subarray(11));
        controller.close();
      },
    });
    const response = await proxyCatalog(request(stream), params);
    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ body }));
  });

  it('rejects malformed UTF-8 instead of silently replacing invalid bytes', async () => {
    const fetchMock = upstream();
    const bytes = Uint8Array.from([123, 34, 120, 34, 58, 34, 0xc3, 0x28, 34, 125]);
    const response = await proxyCatalog(request(bytes), params);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before contacting the API', async () => {
    const fetchMock = upstream();
    const response = await proxyCatalog(request('{"name":'), params);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a generic error when reading the upload fails', async () => {
    const fetchMock = upstream();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error('private transport details')); },
    });
    const response = await proxyCatalog(request(stream), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Dados inválidos.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels a pending read when the client aborts the request', async () => {
    const fetchMock = upstream();
    const controller = new AbortController();
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const responsePromise = proxyCatalog(request(stream, controller.signal), params);
    controller.abort(new Error('private abort reason'));
    const response = await responsePromise;
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Solicitação interrompida.' });
    expect(cancelled).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose details when the upstream request aborts', async () => {
    const fetchMock = upstream();
    fetchMock.mockRejectedValue(new DOMException('private upstream details', 'AbortError'));
    const response = await proxyCatalog(request('{}'), params);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: 'Não foi possível acessar o serviço. Tente novamente.' });
  });
});
