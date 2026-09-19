'use server';
import { headers } from 'next/headers';
import { logger } from '@platform/config';

export async function saveBarbershop(id: string, kind: 'details' | 'location', locationId: string | null, body: unknown): Promise<{ error?: string; saved?: boolean }> {
  const validId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value);
  if (!validId(id) || locationId !== null && !validId(locationId) || !['details', 'location'].includes(kind)) return { error: 'Identificador inválido.' };
  const incoming = await headers();
  const path = `/v1/admin/tenants/${id}${kind === 'location' ? `/locations${locationId ? `/${locationId}` : ''}` : ''}`;
  try {
    const originHeader = incoming.get('origin') || `http://${incoming.get('host')}`;
    const response = await fetch(new URL(path, process.env.API_URL || 'http://localhost:4000'), {
      method: kind === 'location' && !locationId ? 'POST' : 'PATCH', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', cookie: incoming.get('cookie') ?? '', origin: originHeader }, body: JSON.stringify(body),
    });
    if (response.ok) return { saved: true };
    const messages: Record<number, string> = {
      400: 'Revise os campos. Use um e-mail e um fuso horário válidos e selecione um plano disponível.',
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'A operação não foi permitida. Confira seu acesso e o limite de unidades habilitado no plano.',
      404: 'Barbearia ou unidade não encontrada. Recarregue a página.',
      409: 'Não foi possível salvar: os dados podem ter mudado, o identificador pode estar em uso ou a unidade possui atendimentos futuros. Recarregue antes de tentar novamente.',
      429: 'Muitas solicitações. Aguarde um momento.',
    };
    return { error: messages[response.status] ?? 'Não foi possível confirmar a alteração. Recarregue para conferir os dados.' };
  } catch (err) {
    logger.error('Failed to save barbershop', err, { tenantId: id, locationId, kind });
    return { error: 'A conexão foi interrompida. Recarregue para conferir se a alteração foi salva.' };
  }
}
