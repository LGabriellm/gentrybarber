'use server';
import { headers } from 'next/headers';
import { logger } from '@platform/config';

export async function createTenantAction(formData: FormData): Promise<{ error?: string; slug?: string }> {
  const incoming = await headers();
  const body = Object.fromEntries(['name', 'slug', 'planId', 'ownerEmail', 'timezone'].map(key => [key, formData.get(key)]));
  try {
    const host = incoming.get('host') || 'localhost';
    const proto = incoming.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    const originHeader = incoming.get('origin') || `${proto}://${host}`;
    const response = await fetch(new URL('/v1/admin/tenants', process.env.API_URL || 'http://localhost:4000'), {
      method: 'POST', cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', cookie: incoming.get('cookie') ?? '', origin: originHeader }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const messages: Record<number, string> = { 400: 'Revise os campos e selecione um plano ativo.', 401: 'Sua sessão expirou. Entre novamente.', 403: 'Sua conta não tem acesso a esta operação ou a plataforma ainda não foi configurada.', 404: 'O responsável precisa ter uma conta cadastrada com e-mail verificado.', 409: 'Este identificador já está em uso. Busque a barbearia antes de tentar novamente.', 429: 'Muitas solicitações. Aguarde um momento antes de tentar novamente.' };
      return { error: messages[response.status] ?? 'Não foi possível confirmar o cadastro. Consulte a lista antes de tentar novamente.' };
    }
    const result = await response.json();
    return typeof result.slug === 'string' ? { slug: result.slug } : { error: 'Resposta inesperada. Consulte a lista de barbearias.' };
  } catch (err) {
    logger.error('Failed to create tenant', err, { slug: body.slug });
    return { error: 'A conexão foi interrompida. Consulte a lista para verificar se a barbearia foi cadastrada.' };
  }
}
