'use server';

import { headers } from 'next/headers';
import { logger } from '@platform/config';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export async function adminTenantOperation<T>(tenantId: string, path: string, method: Method = 'GET', body?: unknown): Promise<{ data?: T; error?: string; status?: number }> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) || !/^(?:services|professionals|schedule)(?:[/?][a-zA-Z0-9_?=&%-]+)?$/.test(path)) return { error: 'Operação inválida.' };
  const incoming = await headers();
  try {
    const response = await fetch(new URL(`/v1/admin/tenants/${tenantId}/${path}`, process.env.API_URL || 'http://localhost:4000'), {
      method, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json', cookie: incoming.get('cookie') ?? '', origin: incoming.get('origin') ?? '' },
      ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
    if (response.ok) return { data: await response.json() as T, status: response.status };
    const messages: Record<number, string> = { 400: 'Revise os campos informados.', 401: 'Sua sessão expirou.', 403: 'A operação não foi permitida.', 404: 'O registro não foi encontrado nesta barbearia.', 409: 'Os dados mudaram ou a alteração conflita com atendimentos futuros. Recarregue antes de tentar novamente.', 429: 'Muitas solicitações. Aguarde um momento.' };
    return { error: messages[response.status] ?? 'Não foi possível concluir a operação.', status: response.status };
  } catch (error) {
    logger.error('Failed admin tenant operation', error, { tenantId, path, method });
    return { error: 'A conexão foi interrompida. Recarregue para conferir o estado atual.' };
  }
}
