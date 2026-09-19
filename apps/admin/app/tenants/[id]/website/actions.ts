'use server';
import { headers } from 'next/headers';
import { logger } from '@platform/config';

export async function websiteAction(id: string, operation: 'drafts' | 'transitions', body: unknown) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !['drafts', 'transitions'].includes(operation)) return { error: 'Operação inválida.' };
  const incoming = await headers();
  try {
    const originHeader = incoming.get('origin') || `http://${incoming.get('host')}`;
    const response = await fetch(new URL(`/v1/admin/tenants/${id}/website/${operation}`, process.env.API_URL || 'http://localhost:4000'), { method: 'POST', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', cookie: incoming.get('cookie') ?? '', origin: originHeader }, body: JSON.stringify(body) });
    if (response.ok) return { success: true };
    const messages: Record<number, string> = { 400: 'Revise os textos, as cores e o tema selecionado.', 401: 'Entre novamente para continuar.', 403: 'Confira o acesso administrativo e o recurso de site no plano.', 404: 'Barbearia ou versão não encontrada.', 409: 'O site mudou ou a versão não está pronta para esta ação. Recarregue os dados.' };
    return { error: messages[response.status] ?? 'Não foi possível confirmar a operação. Recarregue antes de repetir.' };
  } catch (err) {
    logger.error('Failed to execute website action', err, { tenantId: id, operation });
    return { error: 'A conexão foi interrompida. Recarregue para conferir o resultado.' };
  }
}
