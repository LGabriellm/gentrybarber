import type { Prisma, PrismaClient } from '@platform/database';
import { FeatureEngine, prismaFeatureSource } from '@platform/billing';
import { WhatsAppSendError, type WhatsAppProvider } from './whatsapp';

const templateKey = 'booking.confirmation';
export async function enqueueWhatsAppConfirmation(tx: Prisma.TransactionClient, tenantId: string, appointmentId: string) {
  const appointment = await tx.appointment.findFirst({ where: { tenantId, id: appointmentId }, include: { customer: true } });
  if (!appointment || !appointment.customer.whatsappOptInAt) return;
  if (!await new FeatureEngine(prismaFeatureSource(tx)).hasFeature(tenantId, 'whatsapp_automation')) return;
  await tx.notification.create({ data: {
    tenantId, appointmentId, appointmentVersion: appointment.version, channel: 'WHATSAPP',
    recipient: appointment.customer.phone, templateKey, payload: {},
    idempotencyKey: `wa:${tenantId}:${appointmentId}:${appointment.version}`,
  } });
}

/** PostgreSQL is the durable queue; no external request participates in booking commit. */
export class WhatsAppOutbox {
  constructor(private readonly db: PrismaClient, private readonly provider: WhatsAppProvider, private readonly now = () => new Date()) {}
  async runOnce(): Promise<boolean> {
    const now = this.now();
    // A worker may have died after the provider accepted a send. Never replay an ambiguous send.
    await this.db.notification.updateMany({ where: { channel: 'WHATSAPP', templateKey, status: 'PROCESSING', processingAt: { lt: new Date(now.getTime() - 120_000) } }, data: { status: 'UNKNOWN', lastError: 'WORKER_INTERRUPTED' } });
    const job = await this.db.$transaction(async tx => {
      const candidates = await tx.$queryRaw<{ id: string; tenant_id: string }[]>`
        SELECT id, tenant_id FROM notifications WHERE channel = 'WHATSAPP' AND template_key = ${templateKey}
        AND status = 'PENDING' AND scheduled_at <= ${now} ORDER BY scheduled_at, id FOR UPDATE SKIP LOCKED LIMIT 1`;
      const candidate = candidates[0];
      if (!candidate) return null;
      return tx.notification.update({ where: { tenantId_id: { tenantId: candidate.tenant_id, id: candidate.id } }, data: { status: 'PROCESSING', processingAt: now, attempts: { increment: 1 } } });
    });
    if (!job) return false;
    const finish = (status: 'SENT' | 'FAILED' | 'UNKNOWN' | 'SKIPPED' | 'PENDING', lastError: string | null, extra: Prisma.NotificationUpdateManyMutationInput = {}) =>
      this.db.notification.updateMany({ where: { tenantId: job.tenantId, id: job.id, status: 'PROCESSING' }, data: { status, lastError, ...extra } });
    try {
      const appointment = await this.db.appointment.findFirst({ where: { tenantId: job.tenantId, id: job.appointmentId ?? '' }, include: { customer: true, location: true, tenant: true } });
      const features = new FeatureEngine(prismaFeatureSource(this.db));
      if (!appointment || appointment.version !== job.appointmentVersion || appointment.status !== 'CONFIRMED' || appointment.startsAt <= this.now()
        || !appointment.customer.whatsappOptInAt || appointment.customer.phone !== job.recipient || !appointment.location.active
        || !await features.hasFeature(job.tenantId, 'booking') || !await features.hasFeature(job.tenantId, 'whatsapp_automation')) {
        await finish('SKIPPED', 'NO_LONGER_ELIGIBLE'); return true;
      }
      const date = new Intl.DateTimeFormat('pt-BR', { timeZone: appointment.location.timezone, dateStyle: 'short' }).format(appointment.startsAt);
      const time = new Intl.DateTimeFormat('pt-BR', { timeZone: appointment.location.timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' }).format(appointment.startsAt);
      const result = await this.provider.send({ tenantId: job.tenantId, to: job.recipient, parameters: [appointment.customer.name, appointment.tenant.name, date, time] });
      await finish('SENT', null, { providerMessageId: result.messageId, sentAt: this.now() });
    } catch (error) {
      const known = error instanceof WhatsAppSendError ? error : new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN');
      if (known.kind === 'retryable' && job.attempts < 4) await finish('PENDING', known.code, { scheduledAt: new Date(this.now().getTime() + 60_000 * 2 ** (job.attempts - 1)), processingAt: null });
      else await finish(known.kind === 'unknown' ? 'UNKNOWN' : 'FAILED', known.code);
    }
    return true;
  }
}
