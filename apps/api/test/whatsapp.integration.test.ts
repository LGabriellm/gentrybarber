import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WhatsAppOutbox, WhatsAppSendError, type WhatsAppProvider } from '@platform/notifications';
import { bookingDb as db, bookingTenant, bookingRoute, bookingWrite, bookingGet, setupBookingTests, cleanupBookingTests, createBookingFixture, createAppointment, appointmentInput, failBookingAudits, restoreBookingAudits } from './booking-fixtures';

describe('Transactional WhatsApp confirmations', () => {
  let featureId: string;
  beforeAll(async () => {
    await setupBookingTests();
    const feature = await db.feature.upsert({ where: { key: 'whatsapp_automation' }, create: { key: 'whatsapp_automation', name: 'WhatsApp' }, update: {} });
    featureId = feature.id;
    await db.tenantFeatureOverride.create({ data: { tenantId: bookingTenant(), featureId, enabled: true, reason: 'Fictitious integration' } });
  });
  afterAll(cleanupBookingTests);
  async function fixture() {
    const f = await createBookingFixture();
    await db.customer.update({ where: { tenantId_id: { tenantId: f.tenantId, id: f.customerId } }, data: { whatsappOptInAt: new Date() } });
    return f;
  }
  const provider = () => ({ send: vi.fn<WhatsAppProvider['send']>().mockResolvedValue({ messageId: 'wamid.fictitious' }) });
  const jobs = (appointmentId: string) => db.notification.findMany({ where: { tenantId: bookingTenant(), appointmentId }, orderBy: { createdAt: 'asc' } });
  it('queues once on commit, preserves booking replay and claims concurrently once', async () => {
    const f = await fixture(); const input = appointmentInput(f);
    const response = await bookingWrite('POST', bookingRoute('/appointments'), input);
    expect(response.statusCode, response.body).toBe(201);
    const appointment = response.json();
    expect((await bookingWrite('POST', bookingRoute('/appointments'), input)).statusCode).toBe(201);
    expect(await jobs(appointment.id)).toHaveLength(1);
    const fake = provider();
    await Promise.all([new WhatsAppOutbox(db, fake).runOnce(), new WhatsAppOutbox(db, fake).runOnce()]);
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(fake.send.mock.calls[0]?.[0]).toMatchObject({ tenantId: f.tenantId, parameters: expect.arrayContaining(['Fictitious appointment customer']) });
    expect((await jobs(appointment.id))[0]).toMatchObject({ status: 'SENT', attempts: 1, providerMessageId: 'wamid.fictitious' });
  });
  it('does not queue without consent or entitlement', async () => {
    const f = await createBookingFixture(); const first = await createAppointment(f);
    expect(await jobs(first.id)).toHaveLength(0);
    const other = await createBookingFixture('b');
    await db.customer.update({ where: { tenantId_id: { tenantId: other.tenantId, id: other.customerId } }, data: { whatsappOptInAt: new Date() } });
    const second = await createAppointment(other);
    expect(await db.notification.count({ where: { tenantId: other.tenantId, appointmentId: second.id } })).toBe(0);
  });
  it('rolls back booking and outbox when audit fails', async () => {
    const f = await fixture(); const input = appointmentInput(f);
    await failBookingAudits();
    try { expect((await bookingWrite('POST', bookingRoute('/appointments'), input)).statusCode).toBe(500); }
    finally { await restoreBookingAudits(); }
    expect(await db.appointment.count({ where: { tenantId: f.tenantId, idempotencyKey: input.idempotencyKey } })).toBe(0);
    expect(await db.notification.count({ where: { tenantId: f.tenantId, status: 'PENDING' } })).toBe(0);
  });
  it.each(['consent', 'cancel', 'feature'] as const)('rechecks %s before dispatch', async reason => {
    const f = await fixture(); const appointment = await createAppointment(f);
    if (reason === 'consent') await db.customer.updateMany({ where: { tenantId: f.tenantId, id: f.customerId }, data: { whatsappOptInAt: null } });
    if (reason === 'cancel') await bookingWrite('POST', bookingRoute(`/appointments/${appointment.id}/status`), { expectedVersion: appointment.version, status: 'CANCELED', reason: null });
    if (reason === 'feature') await db.tenantFeatureOverride.update({ where: { tenantId_featureId: { tenantId: f.tenantId, featureId } }, data: { enabled: false } });
    const fake = provider();
    try { await new WhatsAppOutbox(db, fake).runOnce(); expect(fake.send).not.toHaveBeenCalled(); expect((await jobs(appointment.id))[0]?.status).toBe('SKIPPED'); }
    finally { if (reason === 'feature') await db.tenantFeatureOverride.update({ where: { tenantId_featureId: { tenantId: f.tenantId, featureId } }, data: { enabled: true } }); }
  });
  it('discards old schedule and sends only the rescheduled revision', async () => {
    const f = await fixture(); const appointment = await createAppointment(f);
    expect((await bookingWrite('POST', bookingRoute(`/appointments/${appointment.id}/reschedule`), { expectedVersion: appointment.version, startsAt: f.at(11) })).statusCode).toBe(200);
    const fake = provider(); const worker = new WhatsAppOutbox(db, fake);
    await worker.runOnce(); await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect((await jobs(appointment.id)).map(job => job.status)).toEqual(['SKIPPED', 'SENT']);
  });
  it('retries rate limiting but never retries an ambiguous provider response', async () => {
    const f = await fixture(); const appointment = await createAppointment(f);
    let now = new Date();
    const fake = provider(); fake.send.mockRejectedValueOnce(new WhatsAppSendError('retryable', 'RATE_LIMITED')).mockRejectedValueOnce(new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN'));
    const worker = new WhatsAppOutbox(db, fake, () => now);
    await worker.runOnce(); expect((await jobs(appointment.id))[0]?.status).toBe('PENDING');
    expect(await worker.runOnce()).toBe(false);
    now = new Date(now.getTime() + 61_000); await worker.runOnce(); await worker.runOnce();
    expect(fake.send).toHaveBeenCalledTimes(2); expect((await jobs(appointment.id))[0]?.status).toBe('UNKNOWN');
  });
  it('isolates history and requires permission and entitlement', async () => {
    const response = await bookingGet(bookingRoute('/whatsapp'));
    expect(response.statusCode).toBe(200);
    expect(response.json().items.length).toBeGreaterThan(0);
    expect(response.body).not.toContain('recipient'); expect(response.body).not.toContain('providerMessageId');
    expect((await bookingGet(bookingRoute('/whatsapp', 'b'))).statusCode).toBe(403);
    expect((await bookingGet(bookingRoute('/whatsapp', 'foreign'))).statusCode).toBe(404);
    expect((await bookingGet(bookingRoute('/whatsapp'), null)).statusCode).toBe(401);
  });

  it('allows retry only after explicit failure and never after an ambiguous send', async () => {
    const f = await fixture(); const appointment = await createAppointment(f);
    const fake = provider(); fake.send.mockRejectedValueOnce(new WhatsAppSendError('rejected', 'NOT_CONFIGURED'));
    const worker = new WhatsAppOutbox(db, fake); await worker.runOnce();
    const job = (await jobs(appointment.id))[0]!;
    expect(job.status).toBe('FAILED');
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${job.id}/retry`), {})).statusCode).toBe(200);
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${job.id}/retry`), {})).statusCode).toBe(409);
    await worker.runOnce(); expect((await jobs(appointment.id))[0]?.status).toBe('SENT');
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${job.id}/retry`), {})).statusCode).toBe(409);
    const unknown = await db.notification.findFirstOrThrow({ where: { tenantId: bookingTenant(), status: 'UNKNOWN' } });
    expect((await bookingWrite('POST', bookingRoute(`/whatsapp/${unknown.id}/retry`), {})).statusCode).toBe(409);
  });

  it('records consent, revokes it on phone changes and rejects stale consent updates', async () => {
    const f = await createBookingFixture();
    const customer = await db.customer.findFirstOrThrow({ where: { tenantId: f.tenantId, id: f.customerId } });
    const fields = { name: customer.name, phone: customer.phone, email: null, notes: null, expectedVersion: customer.version, whatsappOptIn: true };
    const opted = await bookingWrite('PATCH', bookingRoute(`/customers/${customer.id}`), fields);
    expect(opted.statusCode).toBe(200); expect(opted.json().whatsappOptInAt).not.toBeNull();
    expect((await bookingWrite('PATCH', bookingRoute(`/customers/${customer.id}`), { ...fields, whatsappOptIn: false })).statusCode).toBe(409);
    const changed = await bookingWrite('PATCH', bookingRoute(`/customers/${customer.id}`), { ...fields, expectedVersion: opted.json().version, phone: '+5511222222222' });
    expect(changed.statusCode).toBe(200); expect(changed.json().whatsappOptInAt).toBeNull();
  });

  it('does not replay a worker interrupted after claiming a job', async () => {
    const f = await fixture(); const appointment = await createAppointment(f);
    await db.notification.updateMany({ where: { tenantId: f.tenantId, appointmentId: appointment.id }, data: { status: 'PROCESSING', processingAt: new Date(Date.now() - 180_000), attempts: 1 } });
    const fake = provider(); await new WhatsAppOutbox(db, fake).runOnce();
    expect(fake.send).not.toHaveBeenCalled(); expect((await jobs(appointment.id))[0]?.status).toBe('UNKNOWN');
  });
});

