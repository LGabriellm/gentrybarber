import type { Prisma, PrismaClient } from '@platform/database';
import { FeatureEngine, prismaFeatureSource } from '@platform/billing';
import { WhatsAppSendError, whatsappTemplateKeys, type WhatsAppProvider, type WhatsAppTemplateKey } from './whatsapp';

export const CUSTOMER_REMINDER_LEAD_MS = 60 * 60_000;
export const BARBER_REMINDER_LEAD_MS = 15 * 60_000;

export async function enqueueWhatsAppNotifications(
  tx: Prisma.TransactionClient,
  tenantId: string,
  appointmentId: string,
  now: Date = new Date(),
  options: { customerOptIn?: boolean } = {},
) {
  const appointment = await tx.appointment.findFirst({
    where: { tenantId, id: appointmentId },
    include: { customer: true, professional: true },
  });
  if (!appointment || appointment.status !== 'CONFIRMED' || appointment.startsAt <= now) return;
  if (!await new FeatureEngine(prismaFeatureSource(tx)).hasFeature(tenantId, 'whatsapp_automation')) return;

  const jobs: Prisma.NotificationCreateManyInput[] = [];

  if (appointment.customer.whatsappOptInAt && options.customerOptIn !== false) {
    jobs.push({
      tenantId,
      appointmentId,
      appointmentVersion: appointment.version,
      channel: 'WHATSAPP',
      recipient: appointment.customer.phone,
      templateKey: 'booking.confirmation',
      payload: {},
      scheduledAt: now,
      idempotencyKey: `wa:${tenantId}:${appointmentId}:${appointment.version}`,
    });

    const customerReminderAt = new Date(appointment.startsAt.getTime() - CUSTOMER_REMINDER_LEAD_MS);
    if (customerReminderAt > now) {
      jobs.push({
        tenantId,
        appointmentId,
        appointmentVersion: appointment.version,
        channel: 'WHATSAPP',
        recipient: appointment.customer.phone,
        templateKey: 'booking.customer_reminder',
        payload: {},
        scheduledAt: customerReminderAt,
        idempotencyKey: `wa:customer_reminder:${tenantId}:${appointmentId}:${appointment.version}`,
      });
    }
  }

  if (appointment.professional.active && appointment.professional.phone) {
    const barberReminderAt = new Date(Math.max(now.getTime(), appointment.startsAt.getTime() - BARBER_REMINDER_LEAD_MS));
    jobs.push({
      tenantId,
      appointmentId,
      appointmentVersion: appointment.version,
      channel: 'WHATSAPP',
      recipient: appointment.professional.phone,
      templateKey: 'booking.barber_reminder',
      payload: {},
      scheduledAt: barberReminderAt,
      idempotencyKey: `wa:barber_reminder:${tenantId}:${appointmentId}:${appointment.version}`,
    });
  }

  if (jobs.length > 0) {
    await tx.notification.createMany({ data: jobs });
  }
}

export const enqueueWhatsAppConfirmation = enqueueWhatsAppNotifications;

function isWhatsAppTemplateKey(value: string): value is WhatsAppTemplateKey {
  return (whatsappTemplateKeys as readonly string[]).includes(value);
}

/** PostgreSQL is the durable queue; no external request participates in booking commit. */
export class WhatsAppOutbox {
  constructor(
    private readonly db: PrismaClient,
    private readonly provider: WhatsAppProvider,
    private readonly now = () => new Date(),
  ) {}

  async runOnce(): Promise<boolean> {
    const now = this.now();
    // A worker may have died after the provider accepted a send. Never replay an ambiguous send.
    await this.db.notification.updateMany({
      where: {
        channel: 'WHATSAPP',
        templateKey: { in: [...whatsappTemplateKeys] },
        status: 'PROCESSING',
        processingAt: { lt: new Date(now.getTime() - 120_000) },
      },
      data: { status: 'UNKNOWN', lastError: 'WORKER_INTERRUPTED' },
    });

    const job = await this.db.$transaction(async tx => {
      const candidates = await tx.$queryRaw<{ id: string; tenant_id: string }[]>`
        SELECT id, tenant_id FROM notifications
        WHERE channel = 'WHATSAPP'
          AND template_key IN ('booking.confirmation', 'booking.customer_reminder', 'booking.barber_reminder')
          AND status = 'PENDING'
          AND scheduled_at <= ${now}
        ORDER BY scheduled_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1`;
      const candidate = candidates[0];
      if (!candidate) return null;
      return tx.notification.update({
        where: { tenantId_id: { tenantId: candidate.tenant_id, id: candidate.id } },
        data: { status: 'PROCESSING', processingAt: now, attempts: { increment: 1 } },
      });
    });

    if (!job) return false;

    const finish = (
      status: 'SENT' | 'FAILED' | 'UNKNOWN' | 'SKIPPED' | 'PENDING',
      lastError: string | null,
      extra: Prisma.NotificationUpdateManyMutationInput = {},
    ) =>
      this.db.notification.updateMany({
        where: { tenantId: job.tenantId, id: job.id, status: 'PROCESSING' },
        data: { status, lastError, ...extra },
      });

    try {
      const templateKey = isWhatsAppTemplateKey(job.templateKey) ? job.templateKey : 'booking.confirmation';
      const appointment = await this.db.appointment.findFirst({
        where: { tenantId: job.tenantId, id: job.appointmentId ?? '' },
        include: {
          customer: true,
          professional: true,
          location: true,
          tenant: true,
          services: { where: { tenantId: job.tenantId }, orderBy: { serviceId: 'asc' } },
        },
      });
      const features = new FeatureEngine(prismaFeatureSource(this.db));
      const baseEligible = Boolean(
        appointment
        && appointment.version === job.appointmentVersion
        && appointment.status === 'CONFIRMED'
        && appointment.startsAt > this.now()
        && appointment.location.active
        && ['ACTIVE', 'TRIAL'].includes(appointment.tenant.status)
        && await features.hasFeature(job.tenantId, 'booking')
        && await features.hasFeature(job.tenantId, 'whatsapp_automation'),
      );

      const recipientEligible = Boolean(
        appointment && (
          templateKey === 'booking.barber_reminder'
            ? appointment.professional.active && appointment.professional.phone && appointment.professional.phone === job.recipient
            : appointment.customer.whatsappOptInAt && appointment.customer.phone === job.recipient
        ),
      );

      if (!appointment || !baseEligible || !recipientEligible) {
        await finish('SKIPPED', 'NO_LONGER_ELIGIBLE');
        if (job.appointmentId && job.appointmentVersion !== null) {
          const siblingTemplates = !baseEligible
            ? [...whatsappTemplateKeys]
            : templateKey === 'booking.barber_reminder'
              ? (['booking.barber_reminder'] as const)
              : (['booking.confirmation', 'booking.customer_reminder'] as const);
          await this.db.notification.updateMany({
            where: {
              tenantId: job.tenantId,
              appointmentId: job.appointmentId,
              appointmentVersion: job.appointmentVersion,
              channel: 'WHATSAPP',
              templateKey: { in: [...siblingTemplates] },
              status: 'PENDING',
            },
            data: { status: 'SKIPPED', lastError: 'NO_LONGER_ELIGIBLE' },
          });
        }
        return true;
      }

      const date = new Intl.DateTimeFormat('pt-BR', {
        timeZone: appointment.location.timezone,
        dateStyle: 'short',
      }).format(appointment.startsAt);
      const time = new Intl.DateTimeFormat('pt-BR', {
        timeZone: appointment.location.timezone,
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'shortOffset',
      }).format(appointment.startsAt);

      const servicesSummary = appointment.services.map(item => item.name).join(', ').slice(0, 200) || appointment.tenant.name;
      const parameters = templateKey === 'booking.barber_reminder'
        ? [appointment.professional.name, appointment.customer.name, servicesSummary, time]
        : [appointment.customer.name, appointment.tenant.name, date, time];

      const result = await this.provider.send({
        tenantId: job.tenantId,
        ...(appointment.tenant.zernioAccountId ? { accountId: appointment.tenant.zernioAccountId } : {}),
        to: job.recipient,
        templateKey,
        parameters,
      });
      await finish('SENT', null, { providerMessageId: result.messageId, sentAt: this.now() });
    } catch (error) {
      const known = error instanceof WhatsAppSendError ? error : new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN');
      if (known.kind === 'retryable' && job.attempts < 4) {
        await finish('PENDING', known.code, {
          scheduledAt: new Date(this.now().getTime() + 60_000 * 2 ** (job.attempts - 1)),
          processingAt: null,
        });
      } else {
        await finish(known.kind === 'unknown' ? 'UNKNOWN' : 'FAILED', known.code);
      }
    }
    return true;
  }
}
