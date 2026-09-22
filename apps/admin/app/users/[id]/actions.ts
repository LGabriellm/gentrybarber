'use server';

import { headers } from 'next/headers';
import { logger } from '@platform/config';

export async function manageUser(id: string, body: unknown, reset = false): Promise<{ error?: string; saved?: boolean }> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return { error: 'Identificador inválido.' };
  const incoming = await headers();
  try {
    const response = await fetch(new URL(`/v1/admin/users/${id}${reset ? '/password-reset' : ''}`, process.env.API_URL || 'http://localhost:4000'), {
      method: reset ? 'POST' : 'PATCH', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', cookie: incoming.get('cookie') ?? '', origin: incoming.get('origin') ?? '' }, body: JSON.stringify(body),
    });
    if (response.ok) return { saved: true };
    const messages: Record<number, string> = {
      400: 'Revise os campos informados.', 401: 'Sua sessão expirou. Entre novamente.', 403: 'A operação não foi permitida.',
      404: 'Usuário, barbearia ou função não encontrada.', 409: 'Os dados mudaram ou esta ação removeria o último proprietário ativo. Recarregue a página.',
      429: 'Muitas solicitações. Aguarde um momento.',
    };
    return { error: messages[response.status] ?? 'Não foi possível confirmar a alteração.' };
  } catch (error) {
    logger.error('Failed to manage user', error, { userId: id, reset });
    return { error: 'A conexão foi interrompida. Recarregue para conferir o estado atual.' };
  }
}
