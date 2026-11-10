import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BARBER_REMINDER_LEAD_MS, CUSTOMER_REMINDER_LEAD_MS, WhatsAppOutbox, WhatsAppSendError, type WhatsAppProvider } from '@platform/notifications';
import { bookingDb as db, bookingTenant, bookingRoute, bookingWrite, bookingGet, setupBookingTests, cleanupBookingTests, createBookingFixture, createAppointment, appointmentInput, failBookingAudits, restoreBookingAudits, newPhone } from './booking-fixtures';

describe('Transactional WhatsApp confirmations, customer reminders, and barber reminders', () => {
  let featureId: string;
  beforeAll(async () => {
    await setupBookingTests();
    const feature = await db.feature.upsert({ where: { key: 'whatsapp_automation' }, create: { key: 'whatsapp_automation', name: 'WhatsApp' }, update: {} });
    featureId = feature.id;
    await db.tenantFeatureOverride.create({ data: { tenantId: bookingTenant(), featureId, enabled: true, reason: 'Fictitious integration' } });

    // Enable website feature and published site configuration for bookingTenant() so public booking endpoints pass authorization
    const websiteFeature = await db.feature.upsert({ where: { key: 'website' }, create: { key: 'website', name: 'Website' }, update: {} });
    await db.tenantFeatureOverride.create({ data: { tenantId: bookingTenant(), featureId: websiteFeature.id, enabled: true, reason: 'Public booking test' } });

    const themeKey = `theme_wa_${bookingTenant()}`;
    const theme = await db.theme.create({ data: { key: themeKey, name: 'WhatsApp Theme', kind: 'BESPOKE', ownerTenantId: bookingTenant(), active: true } });
    const themeVersion = await db.themeVersion.create({ data: { themeId: theme.id, tenantId: bookingTenant(), version: 1, status: 'PUBLISHED', config: { tokens: {} } } });
    await db.siteConfiguration.create({ data: { tenantId: bookingTenant(), title: 'WhatsApp Site', description: 'Test', published: true, themeId: theme.id, publishedThemeVersionId: themeVersion.id } });
  });
  afterAll(async () => {
    await db.siteConfiguration.deleteMany({ where: { tenantId: bookingTenant() } });
    await db.themeVersion.deleteMany({ where: { tenantId: bookingTenant() } });
    await db.theme.deleteMany({ where: { key: `theme_wa_${bookingTenant()}` } });
    await cleanupBookingTests();
  });

  async function fixture(withBarberPhone = false) {
    const f = await createBookingFixture();
    await db.customer.update({ where: { tenantId_id: { tenantId: f.tenantId, id: f.customerId } }, data: { whatsappOptInAt: new Date() } });
    if (withBarberPhone) {
      await db.professional.update({ where: { tenantId_id: { tenantId: f.tenantId, id: f.professionalId } }, data: { phone: newPhone() } });
    }
    return f;
  }

  const provider = () => ({ send: vi.fn<WhatsAppProvider['send']>().mockResolvedValue({ messageId: 'wamid.fictitious' }) });
  const jobs = (appointmentId: string, templateKey?: string) =>
    db.notification.findMany({
      where: { tenantId: bookingTenant(), appointmentId, ...(templateKey ? { templateKey } : {}) },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });

  it('queues confirmation, 1h customer reminder, and 15m barber reminder on commit, preserves replay, and dispatches at scheduled times', async () => {
    const f = await fixture(true);
    const input = appointmentInput(f);
    const response = await bookingWrite('POST', bookingRoute('/appointments'), input);
    expect(response.statusCode, response.body).toBe(201);
    const appointment = response.json();
    expect((await bookingWrite('POST', bookingRoute('/appointments'), input)).statusCode).toBe(201);

    const allJobs = await jobs(appointment.id);
    expect(allJobs.map(j => j.templateKey)).toEqual([
      'booking.confirmation',
      'booking.customer_reminder',
      'booking.barber_reminder',
    ]);

    const startsAtMs = new Date(appointment.startsAt).getTime();
    expect(allJobs[1]!.scheduledAt.getTime()).toBe(startsAtMs - CUSTOMER_REMINDER_LEAD_MS);
    expect(allJobs[2]!.scheduledAt.getTime()).toBe(startsAtMs - BARBER_REMINDER_LEAD_MS);

    const fake = provider();
    await Promise.all([new WhatsAppOutbox(db, fake).runOnce(), new WhatsAppOutbox(db, fake).runOnce()]);
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(fake.send.mock.calls[0]?.[0]).toMatchObject({
      tenantId: f.tenantId,
      templateKey: 'booking.confirmation',
      parameters: expect.arrayContaining(['Fictitious appointment customer']),
    });

    // Advance clock to 1 hour before startsAt -> customer reminder dispatches
    const atCustomerReminder = new Date(startsAtMs - CUSTOMER_REMINDER_LEAD_MS + 1_000);
    await new WhatsAppOutbox(db, fake, () => atCustomerReminder).runOnce();
    expect(fake.send).toHaveBeenCalledTimes(2);
    expect(fake.send.mock.calls[1]?.[0]).toMatchObject({
      tenantId: f.tenantId,
      templateKey: 'booking.customer_reminder',
      parameters: expect.arrayContaining(['Fictitious appointment customer']),
    });

    // Advance clock to 15 minutes before startsAt -> barber next-client reminder dispatches
    const atBarberReminder = new Date(startsAtMs - BARBER_REMINDER_LEAD_MS + 1_000);
    await new WhatsAppOutbox(db, fake, () => atBarberReminder).runOnce();
    expect(fake.send).toHaveBeenCalledTimes(3);
    expect(fake.send.mock.calls[2]?.[0]).toMatchObject({
      tenantId: f.tenantId,
      templateKey: 'booking.barber_reminder',
      parameters: [
        'Fictitious booking professional',
        'Fictitious appointment customer',
        'Contracted fictitious cut',
        expect.any(String),
      ],
    });

    const finalJobs = await jobs(appointment.id);
    expect(finalJobs.map(j => j.status)).toEqual(['SENT', 'SENT', 'SENT']);
  });

  it('enqueues customer confirmation and reminder on public booking with opt-in', async () => {
    const f = await createBookingFixture();
    await db.professional.update({ where: { tenantId_id: { tenantId: f.tenantId, id: f.professionalId } }, data: { phone: newPhone() } });
    const response = await bookingWrite(
      'POST',
      '/v1/public/booking/appointments',
      {
        hostname: `${bookingTenant()}.platform.test`,
        locationId: f.locationId,
        professionalId: f.professionalId,
        serviceIds: [f.serviceId],
        startsAt: f.at(10),
        idempotencyKey: randomUUID(),
        customer: { name: 'Public Opt-In Customer', phone: newPhone(), email: null, notes: null, whatsappOptIn: true },
      },
      { session: null },
    );
    expect(response.statusCode, response.body).toBe(201);
    const createdJobs = await jobs(response.json().id);
    expect(createdJobs.map(j => j.templateKey)).toEqual([
      'booking.confirmation',
      'booking.customer_reminder',
      'booking.barber_reminder',
    ]);
  });

  it('does not queue without consent or entitlement', async () => {
    const f = await createBookingFixture();
    const first = await createAppointment(f);
    expect(await jobs(first.id)).toHaveLength(0);
    const other = await createBookingFixture('b');
    await db.customer.update({ where: { tenantId_id: { tenantId: other.tenantId, id: other.customerId } }, data: { whatsappOptInAt: new Date() } });
    const second = await createAppointment(other);
    expect(await db.notification.count({ where: { tenantId: other.tenantId, appointmentId: second.id } })).toBe(0);
  });

  it('rolls back booking and outbox when audit fails', async () => {
    const f = await fixture(true);
    const input = appointmentInput(f);
    await failBookingAudits();
    try { expect((await bookingWrite('POST', bookingRoute('/appointments'), input)).statusCode).toBe(500); }
    finally { await restoreBookingAudits(); }
    expect(await db.appointment.count({ where: { tenantId: f.tenantId, idempotencyKey: input.idempotencyKey } })).toBe(0);
    expect(await db.notification.count({ where: { tenantId: f.tenantId, status: 'PENDING' } })).toBe(0);
  });

  it.each(['consent', 'cancel', 'feature'] as const)('rechecks %s before dispatch', async reason => {
    const f = await fixture();
    const appointment = await createAppointment(f);
    if (reason === 'consent') await db.customer.updateMany({ where: { tenantId: f.tenantId, id: f.customerId }, data: { whatsappOptInAt: null } });
    if (reason === 'cancel') await bookingWrite('POST', bookingRoute(`/appointments/${appointment.id}/status`), { expectedVersion: appointment.version, status: 'CANCELED', reason: null });
    if (reason === 'feature') await db.tenantFeatureOverride.update({ where: { tenantId_featureId: { tenantId: f.tenantId, featureId } }, data: { enabled: false } });
    const fake = provider();
    try {
      await new WhatsAppOutbox(db, fake).runOnce();
      expect(fake.send).not.toHaveBeenCalled();
      expect((await jobs(appointment.id)).map(j => j.status)).toEqual(['SKIPPED', 'SKIPPED']);
    } finally {
      if (reason === 'feature') await db.tenantFeatureOverride.update({ where: { tenantId_featureId: { tenantId: f.tenantId, featureId } }, data: { enabled: true } });
    }
  });

  it('discards old schedule and sends only the rescheduled revision', async () => {
    const f = await fixture();
    const appointment = await createAppointment(f);
    expect((await bookingWrite('POST', bookingRoute(`/appointments/${appointment.id}/reschedule`), { expectedVersion: appointment.version, startsAt: f.at(11) })).statusCode).toBe(200);
    const fake = provider();
    const worker = new WhatsAppOutbox(db, fake);
    await worker.runOnce();
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect((await jobs(appointment.id, 'booking.confirmation')).map(job => job.status)).toEqual(['SKIPPED', 'SENT']);
    expect((await jobs(appointment.id, 'booking.customer_reminder')).map(job => job.status)).toEqual(['SKIPPED', 'PENDING']);
  });

  it('retries rate limiting but never retries an ambiguous provider response', async () => {
    const f = await fixture();
    const appointment = await createAppointment(f);
    let now = new Date();
    const fake = provider();
    fake.send
      .mockRejectedValueOnce(new WhatsAppSendError('retryable', 'RATE_LIMITED'))
      .mockRejectedValueOnce(new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN'));
    const worker = new WhatsAppOutbox(db, fake, () => now);
    await worker.runOnce();
    expect((await jobs(appointment.id, 'booking.confirmation'))[0]?.status).toBe('PENDING');
    expect(await worker.runOnce()).toBe(false);
    now = new Date(now.getTime() + 61_000);
    await worker.runOnce();
    await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(2);
    expect((await jobs(appointment.id, 'booking.confirmation'))[0]?.status).toBe('UNKNOWN');
  });

  it('isolates history and requires permission and entitlement', async () => {
    const response = await bookingGet(bookingRoute('/whatsapp'));
    expect(response.statusCode).toBe(200);
    expect(response.json().items.length).toBeGreaterThan(0);
    expect(response.body).not.toContain('recipient');
    expect(response.body).not.toContain('providerMessageId');
    expect((await bookingGet(bookingRoute('/whatsapp', 'b'))).statusCode).toBe(403);
    expect((await bookingGet(bookingRoute('/whatsapp', 'foreign'))).statusCode).toBe(404);
    expect((await bookingGet(bookingRoute('/whatsapp'), null)).statusCode).toBe(401);
  });

  it('allows retry only after explicit failure and never after an ambiguous send', async () => {
    const f = await fixture();
    const appointment = await createAppointment(f);
    const fake = provider();
    fake.send.mockRejectedValueOnce(new WhatsAppSendError('rejected', 'NOT_CONFIGURED'));
    const worker = new WhatsAppOutbox(db, fake);
    await worker.runOnce();
    const job = (await jobs(appointment.id, 'booking.confirmation'))[0]!;
    expect(job.status).toBe('FAILED');
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${job.id}/retry`), {})).statusCode).toBe(200);
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${job.id}/retry`), {})).statusCode).toBe(409);
    await worker.runOnce();
    expect((await jobs(appointment.id, 'booking.confirmation'))[0]?.status).toBe('SENT');
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${job.id}/retry`), {})).statusCode).toBe(409);
    const unknown = await db.notification.findFirstOrThrow({ where: { tenantId: bookingTenant(), status: 'UNKNOWN' } });
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${unknown.id}/retry`), {})).statusCode).toBe(409);
  });

  it('records consent, revokes it on phone changes and rejects stale consent updates', async () => {
    const f = await createBookingFixture();
    const customer = await db.customer.findFirstOrThrow({ where: { tenantId: f.tenantId, id: f.customerId } });
    const fields = { name: customer.name, phone: customer.phone, email: null, notes: null, expectedVersion: customer.version, whatsappOptIn: true };
    const opted = await bookingWrite('PATCH', bookingRoute(`/customers/${customer.id}`), fields);
    expect(opted.statusCode).toBe(200);
    expect(opted.json().whatsappOptInAt).not.toBeNull();
    expect((await bookingWrite('PATCH', bookingRoute(`/customers/${customer.id}`), { ...fields, whatsappOptIn: false })).statusCode).toBe(409);
    const changed = await bookingWrite('PATCH', bookingRoute(`/customers/${customer.id}`), { ...fields, expectedVersion: opted.json().version, phone: '+5511222222222' });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().whatsappOptInAt).toBeNull();
  });

  it('does not replay a worker interrupted after claiming a job', async () => {
    const f = await fixture();
    const appointment = await createAppointment(f);
    await db.notification.updateMany({
      where: { tenantId: f.tenantId, appointmentId: appointment.id, templateKey: 'booking.confirmation' },
      data: { status: 'PROCESSING', processingAt: new Date(Date.now() - 180_000), attempts: 1 },
    });
    const fake = provider();
    await new WhatsAppOutbox(db, fake).runOnce();
    expect(fake.send).not.toHaveBeenCalled();
    expect((await jobs(appointment.id, 'booking.confirmation'))[0]?.status).toBe('UNKNOWN');
  });
});
