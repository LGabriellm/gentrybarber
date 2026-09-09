import type { AppointmentStatusView } from '@platform/types';

export class OperationError extends Error {
  constructor(public readonly status: number) {
    super(({ 400: 'Revise os campos e as opções selecionadas.', 401: 'Sua sessão expirou. Entre novamente para continuar.', 403: 'Seu acesso a esta operação não está disponível.', 404: 'Um dos registros não está mais disponível nesta barbearia.', 409: 'Os dados ou a disponibilidade mudaram. Recarregue antes de tentar novamente.', 429: 'Muitas tentativas. Aguarde um momento e tente novamente.' } as Record<number, string>)[status] || 'Não foi possível confirmar a operação. Verifique sua conexão e tente novamente.');
  }
}

export async function operation<T>(slug: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/operations/${encodeURIComponent(slug)}/${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20_000),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch { throw new OperationError(0); }
  if (!response.ok) throw new OperationError(response.status);
  try { return await response.json() as T; } catch { throw new OperationError(0); }
}

export function localDate(timezone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function appointmentTime(instant: string, timezone: string, withDate = false): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset', ...(withDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } as const : {}) }).format(new Date(instant));
}

export const statusLabels: Record<AppointmentStatusView, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmado', CHECKED_IN: 'Cliente chegou', IN_PROGRESS: 'Em atendimento', COMPLETED: 'Concluído', CANCELED: 'Cancelado', NO_SHOW: 'Não compareceu' };
export function transitions(status: AppointmentStatusView, startsAt: string): AppointmentStatusView[] {
  const allowed: Partial<Record<AppointmentStatusView, AppointmentStatusView[]>> = { PENDING: ['CANCELED'], CONFIRMED: ['CHECKED_IN', 'CANCELED', 'NO_SHOW'], CHECKED_IN: ['IN_PROGRESS', 'CANCELED', 'NO_SHOW'], IN_PROGRESS: ['COMPLETED', 'CANCELED'] };
  return (allowed[status] || []).filter(next => next !== 'NO_SHOW' || new Date(startsAt).getTime() <= Date.now());
}

export interface BookingAccess { create: boolean; update: boolean; schedules: boolean; customersRead: boolean; customersUpdate: boolean }
