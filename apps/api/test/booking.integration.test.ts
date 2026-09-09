import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppointmentDay, AppointmentView, AvailabilityView, BookingOptions, CustomerView, ScheduleView, TimeOffView, UpdateScheduleInput } from '@platform/types';
import {
  appointmentInput, availabilityUrl, bookingDb as db, bookingError as error, bookingGet as get,
  bookingRoute as route, bookingTenant as tenantId, bookingWrite as write,
  cleanupBookingTests, colleague, createAppointment, createBookingFixture, dateInZone,
  failBookingAudits, fixtureInstant, futureDate, insertLegacyAppointment, newPhone, operator,
  restoreBookingAudits, setupBookingTests, weekWindows, type BookingFixture,
} from './booking-fixtures';

beforeAll(setupBookingTests, 60_000);
afterAll(cleanupBookingTests, 30_000);

async function schedule(fixture: BookingFixture): Promise<ScheduleView> {
  const response = await get(route(`/schedule?locationId=${fixture.locationId}`, fixture.tenant));
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ScheduleView>();
}
function scheduleInput(current: ScheduleView, overrides: Partial<UpdateScheduleInput> = {}): UpdateScheduleInput {
  return {
    locationId: current.location.id, expectedVersion: current.location.version,
    businessHours: current.businessHours,
    professionals: current.professionals.map(item => ({ professionalId: item.id, windows: item.windows })),
    ...overrides,
  };
}
async function availability(fixture: BookingFixture, overrides: Record<string, string> = {}) {
  const response = await get(availabilityUrl(fixture, overrides));
  expect(response.statusCode, response.body).toBe(200);
  return response.json<AvailabilityView>();
}
async function timeOff(fixture: BookingFixture, startsAt: string, endsAt: string, professionalId: string | null = fixture.professionalId) {
  const response = await write('POST', route('/time-offs', fixture.tenant), { locationId: fixture.locationId, professionalId, startsAt, endsAt, reason: 'Fictitious scheduled pause' });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<TimeOffView>();
}
function status(appointment: AppointmentView, next: string, overrides: Record<string, unknown> = {}) {
  return write('POST', route(`/appointments/${appointment.id}/status`), { status: next, expectedVersion: appointment.version, reason: 'Fictitious operator action', ...overrides });
}

describe('Booking API with PostgreSQL, verified sessions and real concurrency', () => {
  it('requires authenticated and verified sessions across the operational booking routes', async () => {
    const fixture = await createBookingFixture();
    for (const session of [null, 'better-auth.session_token=forged']) {
      for (const path of ['/booking/options', '/customers', `/schedule?locationId=${fixture.locationId}`, `/appointments?locationId=${fixture.locationId}&date=${fixture.date}`]) error(await get(route(path), session), 401, 'UNAUTHENTICATED');
      error(await get(availabilityUrl(fixture), session), 401, 'UNAUTHENTICATED');
      error(await write('POST', route('/appointments'), appointmentInput(fixture), { session }), 401, 'UNAUTHENTICATED');
    }
    await db.user.update({ where: { id: operator.id }, data: { emailVerified: false } });
    try { error(await get(route('/booking/options')), 401, 'UNAUTHENTICATED'); }
    finally { await db.user.update({ where: { id: operator.id }, data: { emailVerified: true } }); }
  });

  it.each([
    ['barber', 403, 'FORBIDDEN'], ['no-action', 403, 'FORBIDDEN'], ['no-booking', 403, 'FEATURE_DISABLED'],
    ['inactive-member', 404, 'NOT_FOUND'], ['inactive-tenant', 404, 'NOT_FOUND'], ['foreign', 404, 'NOT_FOUND'],
  ] as const)('denies general calendar access and mutations for %s', async (tenant, code, reason) => {
    const fixture = await createBookingFixture(tenant);
    for (const path of ['/booking/options', '/customers', `/schedule?locationId=${fixture.locationId}`, `/appointments?locationId=${fixture.locationId}&date=${fixture.date}`]) error(await get(route(path, tenant)), code, reason);
    error(await get(availabilityUrl(fixture)), code, reason);
    error(await write('POST', route('/appointments', tenant), appointmentInput(fixture)), code, reason);
    error(await write('POST', route('/customers', tenant), { name: 'Fictitious denied customer', phone: newPhone(), email: null, notes: null }), code, reason);
    error(await write('PUT', route('/schedule', tenant), { locationId: fixture.locationId, expectedVersion: 1, businessHours: [], professionals: [] }), code, reason);
  });

  it('requires the customers entitlement separately from the booking entitlement', async () => {
    expect((await get(route('/booking/options', 'no-customers'))).statusCode).toBe(200);
    error(await get(route('/customers', 'no-customers')), 403, 'FEATURE_DISABLED');
    error(await write('POST', route('/customers', 'no-customers'), { name: 'Fictitious denied customer', phone: newPhone(), email: null, notes: null }), 403, 'FEATURE_DISABLED');
  });

  it('returns scoped booking options without exposing customers, tenant authority or unrelated units', async () => {
    const own = await createBookingFixture();
    const foreign = await createBookingFixture('foreign');
    const response = await get(route('/booking/options'));
    expect(response.statusCode).toBe(200);
    const result = response.json<BookingOptions>();
    expect(result.locations).toContainEqual(expect.objectContaining({ id: own.locationId, timezone: own.timezone }));
    expect(result.professionals).toContainEqual(expect.objectContaining({ id: own.professionalId, serviceIds: expect.arrayContaining([own.serviceId]) }));
    expect(result.services).toContainEqual(expect.objectContaining({ id: own.serviceId, priceCents: 4500 }));
    for (const forbidden of [foreign.locationId, foreign.professionalId, foreign.serviceId, own.customerId, 'tenantId', 'actorUserId']) expect(response.body).not.toContain(forbidden);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('creates and updates customers with canonical phones, tenant uniqueness, CAS and private audit metadata', async () => {
    const phone = newPhone();
    const input = { name: '  Fictitious booking customer  ', phone, email: 'fixture@example.test', notes: 'Confidential fictitious customer notes' };
    const created = await write('POST', route('/customers'), input);
    expect(created.statusCode, created.body).toBe(201);
    const customer = created.json<CustomerView>();
    expect(customer).toMatchObject({ name: 'Fictitious booking customer', phone });
    error(await write('POST', route('/customers'), { ...input, name: 'Duplicate fixture phone' }), 409, 'CONFLICT');
    const otherTenant = await write('POST', route('/customers', 'b'), input);
    expect(otherTenant.statusCode, otherTenant.body).toBe(201);
    expect(otherTenant.json<CustomerView>().id).not.toBe(customer.id);
    const changed = await write('PATCH', route(`/customers/${customer.id}`), { ...input, name: 'Revised fictitious customer', notes: null, email: null, expectedVersion: customer.version });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json<CustomerView>()).toMatchObject({ id: customer.id, name: 'Revised fictitious customer', notes: null, email: null });
    error(await write('PATCH', route(`/customers/${customer.id}`), { ...input, expectedVersion: customer.version }), 409, 'CONFLICT');
    const search = await get(route(`/customers?q=${encodeURIComponent('Revised fictitious')}`));
    expect(search.statusCode).toBe(200);
    expect(search.json<{ items: CustomerView[] }>().items).toContainEqual(changed.json<CustomerView>());
    expect(search.body).not.toContain(otherTenant.json<CustomerView>().id);
    const audit = await db.auditLog.findMany({ where: { tenantId: tenantId(), resourceId: customer.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map(item => item.action)).toEqual(['customer.created', 'customer.updated']);
    expect(audit.every(item => item.resource === 'Customer' && item.actorUserId === operator.id)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(input.notes);
    expect(JSON.stringify(audit)).not.toContain(phone);
  });

  it('rejects invalid E.164, customer fields and cross-tenant customer edits', async () => {
    const input = { name: 'Fictitious customer', phone: newPhone(), email: null, notes: null };
    for (const invalid of [
      ...['11999999999', '+0123456789', '+1234567', '+1234567890123456', '+55 (11) 99999-9999'].map(phone => ({ phone })),
      { name: '  ' }, { name: 'x'.repeat(121) }, { email: 'not-an-email' }, { notes: 'x'.repeat(2001) }, { tenantId: tenantId('foreign') },
    ]) error(await write('POST', route('/customers'), { ...input, ...invalid }), 400, 'INVALID_INPUT');
    const foreign = await createBookingFixture('foreign');
    const before = await db.customer.findUniqueOrThrow({ where: { id: foreign.customerId } });
    error(await write('PATCH', route(`/customers/${foreign.customerId}`), { ...input, expectedVersion: before.version }), 404, 'NOT_FOUND');
    expect(await db.customer.findUnique({ where: { id: foreign.customerId } })).toEqual(before);
    error(await get(route(`/customers?q=${'x'.repeat(81)}`)), 400, 'INVALID_INPUT');
  });

  it('updates weekly hours with unit CAS while preserving schedules of omitted professionals', async () => {
    const fixture = await createBookingFixture();
    const before = await schedule(fixture);
    const colleagueBefore = before.professionals.find(item => item.id === fixture.otherProfessionalId)!;
    const payload = scheduleInput(before, { professionals: [{ professionalId: fixture.professionalId, windows: weekWindows([[600, 720], [840, 1020]]) }] });
    const response = await write('PUT', route('/schedule'), payload);
    expect(response.statusCode, response.body).toBe(200);
    const after = response.json<ScheduleView>();
    expect(after.location.version).not.toBe(before.location.version);
    expect(after.professionals.find(item => item.id === fixture.otherProfessionalId)).toEqual(colleagueBefore);
    expect(after.professionals.find(item => item.id === fixture.professionalId)?.windows).toEqual(payload.professionals[0]!.windows);
    error(await write('PUT', route('/schedule'), payload), 409, 'CONFLICT');
    expect(await db.auditLog.count({ where: { tenantId: tenantId(), resourceId: fixture.locationId, action: 'schedule.updated' } })).toBe(1);
  });

  it('rejects overlapping weekly windows, duplicates and foreign or cross-unit schedules without mutation', async () => {
    const fixture = await createBookingFixture();
    const other = await createBookingFixture();
    const foreign = await createBookingFixture('foreign');
    const before = await schedule(fixture);
    const payload = scheduleInput(before);
    for (const businessHours of [
      [{ weekday: 1, startMinute: 540, endMinute: 660 }, { weekday: 1, startMinute: 600, endMinute: 720 }],
      [{ weekday: 7, startMinute: 540, endMinute: 600 }], [{ weekday: 1, startMinute: 600, endMinute: 600 }],
      [{ weekday: 1, startMinute: -1, endMinute: 100 }], [{ weekday: 1, startMinute: 0, endMinute: 1441 }],
      Array.from({ length: 29 }, (_, index) => ({ weekday: 1, startMinute: index * 30, endMinute: index * 30 + 15 })),
    ]) error(await write('PUT', route('/schedule'), { ...payload, businessHours }), 400, 'INVALID_INPUT');
    error(await write('PUT', route('/schedule'), { ...payload, professionals: [payload.professionals[0], payload.professionals[0]] }), 400, 'INVALID_INPUT');
    for (const professionalId of [other.professionalId, foreign.professionalId]) error(await write('PUT', route('/schedule'), { ...payload, professionals: [{ professionalId, windows: weekWindows([[540, 720]]) }] }), 404, 'NOT_FOUND');
    error(await write('PUT', route('/schedule'), { ...payload, locationId: foreign.locationId }), 404, 'NOT_FOUND');
    expect(await schedule(fixture)).toEqual(before);
  });

  it('combines local timezone, weekly pauses, professional blocks, unit blocks and busy appointments', async () => {
    const fixture = await createBookingFixture();
    await timeOff(fixture, fixture.at(10, 30), fixture.at(11, 15));
    await timeOff(fixture, fixture.at(14), fixture.at(14, 30), null);
    await createAppointment(fixture, { startsAt: fixture.at(15) });
    const result = await availability(fixture, { serviceIds: `${fixture.serviceId},${fixture.secondServiceId}` });
    expect(result).toMatchObject({ timezone: fixture.timezone, durationMinutes: 45, totalCents: 6500 });
    const starts = result.slots.map(item => item.startsAt);
    expect(starts).toContain(fixture.at(9, 30));
    expect(starts).toContain(fixture.at(9, 45));
    expect(starts).toContain(fixture.at(16, 15));
    for (const [hour, minute] of [[9, 0], [10, 0], [10, 30], [11, 0], [11, 30], [12, 0], [13, 30], [14, 0], [14, 30], [15, 0], [15, 15], [16, 30]] as const) expect(starts).not.toContain(fixture.at(hour, minute));
    expect(result.slots.every(slot => Date.parse(slot.endsAt) - Date.parse(slot.startsAt) === 45 * 60_000)).toBe(true);
    const other = await availability(fixture, { professionalId: fixture.otherProfessionalId });
    expect(other.slots.map(item => item.startsAt)).toContain(fixture.at(10, 30));
    expect(other.slots.map(item => item.startsAt)).not.toContain(fixture.at(14));
  });

  it('uses the location calendar date even when its UTC day is different', async () => {
    const fixture = await createBookingFixture('a', 'Pacific/Kiritimati');
    const appointment = await createAppointment(fixture);
    expect(appointment.startsAt.slice(0, 10)).not.toBe(fixture.date);
    const response = await get(route(`/appointments?locationId=${fixture.locationId}&date=${fixture.date}`));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<AppointmentDay>()).toMatchObject({ date: fixture.date, timezone: fixture.timezone, items: [expect.objectContaining({ id: appointment.id })] });
    const previous = await get(route(`/appointments?locationId=${fixture.locationId}&date=${appointment.startsAt.slice(0, 10)}`));
    expect(previous.statusCode).toBe(200);
    expect(previous.json<AppointmentDay>().items).toEqual([]);
  });

  it('rejects invalid availability dates and excludes already passed instants today', async () => {
    const fixture = await createBookingFixture('a', 'UTC');
    for (const date of [futureDate(-2), futureDate(367), '2026-02-30', 'not-a-date']) error(await get(availabilityUrl(fixture, { date })), 400, 'INVALID_INPUT');
    const now = Date.now();
    const today = await availability(fixture, { date: dateInZone(new Date(now), fixture.timezone) });
    expect(today.slots.every(item => Date.parse(item.startsAt) >= now)).toBe(true);
  });

  it('creates a CONFIRMED appointment with server totals, immutable item snapshots and transactional history', async () => {
    const fixture = await createBookingFixture();
    const appointment = await createAppointment(fixture, { serviceIds: [fixture.secondServiceId, fixture.serviceId], notes: 'Private fictitious appointment notes' });
    expect(appointment).toMatchObject({
      status: 'CONFIRMED', startsAt: fixture.at(10), endsAt: fixture.at(10, 45), totalCents: 6500,
      locationId: fixture.locationId, professionalId: fixture.professionalId, customer: { id: fixture.customerId },
    });
    expect(appointment.services).toEqual(expect.arrayContaining([
      { serviceId: fixture.serviceId, name: 'Contracted fictitious cut', durationMinutes: 30, priceCents: 4500 },
      { serviceId: fixture.secondServiceId, name: 'Contracted fictitious beard', durationMinutes: 15, priceCents: 2000 },
    ]));
    const saved = await db.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { services: true, events: true } });
    expect(saved.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.idempotencyKey).toBeTruthy();
    expect(saved.services).toHaveLength(2);
    expect(saved.events).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'CONFIRMED', actorUserId: operator.id, tenantId: tenantId(), locationId: fixture.locationId })]);
    const audit = await db.auditLog.findMany({ where: { tenantId: tenantId(), resourceId: appointment.id } });
    expect(audit).toEqual([expect.objectContaining({ action: 'appointment.created', resource: 'Appointment', actorUserId: operator.id })]);
    expect(JSON.stringify(audit)).not.toContain(appointment.notes);
  });

  it('permits one of two overlapping concurrent requests and permits a reservation adjacent to the winner', async () => {
    const fixture = await createBookingFixture();
    const requests = [appointmentInput(fixture), appointmentInput(fixture, { startsAt: fixture.at(10, 15) })];
    const responses = await Promise.all(requests.map(payload => write('POST', route('/appointments'), payload)));
    expect(responses.map(item => item.statusCode).sort()).toEqual([201, 409]);
    error(responses.find(item => item.statusCode === 409)!, 409, 'CONFLICT');
    const winner = responses.find(item => item.statusCode === 201)!.json<AppointmentView>();
    const adjacent = await createAppointment(fixture, { startsAt: winner.endsAt });
    expect(adjacent.startsAt).toBe(winner.endsAt);
    expect(await db.appointment.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(2);
    expect(await db.appointmentEvent.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(2);
  });

  it('returns one resource for concurrent identical idempotency keys and rejects changed payload or actor', async () => {
    const fixture = await createBookingFixture();
    const payload = appointmentInput(fixture);
    const responses = await Promise.all([write('POST', route('/appointments'), payload), write('POST', route('/appointments'), payload)]);
    for (const response of responses) expect([200, 201], response.body).toContain(response.statusCode);
    const first = responses[0].json<AppointmentView>();
    expect(responses[1].json<AppointmentView>().id).toBe(first.id);
    const replay = await write('POST', route('/appointments'), payload);
    expect([200, 201]).toContain(replay.statusCode);
    expect(replay.json<AppointmentView>().id).toBe(first.id);
    error(await write('POST', route('/appointments'), { ...payload, notes: 'Different normalized payload' }), 409, 'CONFLICT');
    error(await write('POST', route('/appointments'), payload, { session: colleague.cookie }), 409, 'CONFLICT');
    const otherTenant = await createBookingFixture('b');
    const ownKeyElsewhere = await write('POST', route('/appointments', 'b'), appointmentInput(otherTenant, { idempotencyKey: payload.idempotencyKey }));
    expect(ownKeyElsewhere.statusCode, ownKeyElsewhere.body).toBe(201);
    expect(ownKeyElsewhere.json<AppointmentView>().id).not.toBe(first.id);
    expect(await db.appointment.count({ where: { tenantId: tenantId(), idempotencyKey: payload.idempotencyKey } })).toBe(1);
    expect(await db.appointmentEvent.count({ where: { tenantId: tenantId(), appointmentId: first.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId: tenantId(), resourceId: first.id } })).toBe(1);
  });

  it('rejects untrusted fields, duplicate services, off-grid times and reservations outside available hours', async () => {
    const fixture = await createBookingFixture();
    const input = appointmentInput(fixture);
    for (const invalid of [
      { totalCents: 1 }, { endsAt: fixture.at(11) }, { status: 'COMPLETED' }, { tenantId: tenantId('foreign') },
      { serviceIds: [fixture.serviceId, fixture.serviceId] }, { serviceIds: [] }, { notes: 'x'.repeat(2001) },
      { idempotencyKey: '' }, { idempotencyKey: 'x'.repeat(129) }, { startsAt: 'not-a-date' },
    ]) error(await write('POST', route('/appointments'), { ...input, ...invalid }), 400, 'INVALID_INPUT');
    for (const startsAt of [fixture.at(9), fixture.at(10, 7), fixture.at(11, 45), fixture.at(12), fixture.at(17)]) error(await write('POST', route('/appointments'), { ...input, startsAt, idempotencyKey: randomUUID() }), 409, 'CONFLICT');
    expect(await db.appointment.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(0);
  });

  it('rejects cross-tenant and cross-unit identities and services not assigned to the selected professional', async () => {
    const fixture = await createBookingFixture();
    const otherUnit = await createBookingFixture();
    const foreign = await createBookingFixture('foreign');
    for (const overrides of [
      { locationId: foreign.locationId }, { professionalId: foreign.professionalId }, { customerId: foreign.customerId },
      { serviceIds: [foreign.serviceId] }, { professionalId: otherUnit.professionalId }, { serviceIds: [otherUnit.serviceId] },
      { serviceIds: [fixture.unassignedServiceId] }, { serviceIds: [fixture.inactiveServiceId] },
    ]) error(await write('POST', route('/appointments'), appointmentInput(fixture, overrides)), 404, 'NOT_FOUND');
    const invalidAvailability: Record<string, string>[] = [
      { locationId: foreign.locationId }, { professionalId: foreign.professionalId }, { professionalId: otherUnit.professionalId },
      { serviceIds: foreign.serviceId }, { serviceIds: otherUnit.serviceId }, { serviceIds: fixture.unassignedServiceId }, { serviceIds: fixture.inactiveServiceId },
    ];
    for (const overrides of invalidAvailability) error(await get(availabilityUrl(fixture, overrides)), 404, 'NOT_FOUND');
    error(await get(route(`/appointments?locationId=${foreign.locationId}&date=${fixture.date}`)), 404, 'NOT_FOUND');
    error(await get(route(`/schedule?locationId=${foreign.locationId}`)), 404, 'NOT_FOUND');
    const foreignAppointment = await insertLegacyAppointment(foreign, new Date(foreign.at(10)));
    const revision = 1;
    error(await write('POST', route(`/appointments/${foreignAppointment.id}/reschedule`), { startsAt: fixture.at(14), expectedVersion: revision }), 404, 'NOT_FOUND');
    error(await write('POST', route(`/appointments/${foreignAppointment.id}/status`), { status: 'CANCELED', expectedVersion: revision, reason: null }), 404, 'NOT_FOUND');
    expect(await db.appointment.findUnique({ where: { id: foreignAppointment.id } })).toEqual(expect.objectContaining({ status: 'CONFIRMED', startsAt: foreignAppointment.startsAt }));
  });

  it('uses contracted snapshots when rescheduling after catalog edits and prevents stale edits', async () => {
    const fixture = await createBookingFixture();
    const original = await createAppointment(fixture, { serviceIds: [fixture.serviceId, fixture.secondServiceId] });
    await db.service.updateMany({ where: { tenantId: tenantId(), id: { in: [fixture.serviceId, fixture.secondServiceId] } }, data: { name: 'Later catalog label', priceCents: 100, durationMinutes: 10 } });
    const forReschedule = await availability(fixture, { serviceIds: `${fixture.serviceId},${fixture.secondServiceId}`, appointmentId: original.id });
    expect(forReschedule).toMatchObject({ durationMinutes: 45, totalCents: 6500 });
    expect(forReschedule.slots.map(item => item.startsAt)).toContain(original.startsAt);
    const newBooking = await availability(fixture, { serviceIds: `${fixture.serviceId},${fixture.secondServiceId}` });
    expect(newBooking).toMatchObject({ durationMinutes: 20, totalCents: 200 });
    expect(newBooking.slots.map(item => item.startsAt)).not.toContain(original.startsAt);
    error(await get(availabilityUrl(fixture, { appointmentId: original.id, serviceIds: fixture.serviceId })), 404, 'NOT_FOUND');
    const response = await write('POST', route(`/appointments/${original.id}/reschedule`), { startsAt: fixture.at(14), expectedVersion: original.version });
    expect(response.statusCode, response.body).toBe(200);
    const moved = response.json<AppointmentView>();
    expect(moved).toMatchObject({ id: original.id, locationId: original.locationId, professionalId: original.professionalId, customer: original.customer, startsAt: fixture.at(14), endsAt: fixture.at(14, 45), totalCents: 6500, services: original.services });
    expect(moved.version).not.toBe(original.version);
    error(await write('POST', route(`/appointments/${original.id}/reschedule`), { startsAt: fixture.at(15), expectedVersion: original.version }), 409, 'CONFLICT');
    const events = await db.appointmentEvent.findMany({ where: { tenantId: tenantId(), appointmentId: original.id }, orderBy: { createdAt: 'asc' } });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ fromStatus: 'CONFIRMED', toStatus: 'CONFIRMED', reason: 'Reagendamento', actorUserId: operator.id });
    expect(await db.auditLog.count({ where: { tenantId: tenantId(), resourceId: original.id, action: 'appointment.rescheduled' } })).toBe(1);
  });

  it('prevents rescheduling onto another reservation and permits only one concurrent revision', async () => {
    const fixture = await createBookingFixture();
    const appointment = await createAppointment(fixture);
    await createAppointment(fixture, { startsAt: fixture.at(14) });
    error(await write('POST', route(`/appointments/${appointment.id}/reschedule`), { startsAt: fixture.at(14), expectedVersion: appointment.version }), 409, 'CONFLICT');
    const responses = await Promise.all([fixture.at(15), fixture.at(16)].map(startsAt => write('POST', route(`/appointments/${appointment.id}/reschedule`), { startsAt, expectedVersion: appointment.version })));
    expect(responses.map(item => item.statusCode).sort()).toEqual([200, 409]);
    error(responses.find(item => item.statusCode === 409)!, 409, 'CONFLICT');
    expect(await db.appointmentEvent.count({ where: { tenantId: tenantId(), appointmentId: appointment.id } })).toBe(2);
  });

  it('enforces appointment transitions and preserves a single event per successful transition', async () => {
    const fixture = await createBookingFixture();
    const created = await createAppointment(fixture);
    error(await status(created, 'COMPLETED'), 409, 'CONFLICT');
    error(await status(created, 'NO_SHOW'), 409, 'CONFLICT');
    let current = created;
    for (const next of ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED']) {
      const response = await status(current, next);
      expect(response.statusCode, response.body).toBe(200);
      const updated = response.json<AppointmentView>();
      expect(updated.status).toBe(next);
      expect(updated.version).not.toBe(current.version);
      current = updated;
    }
    error(await status(current, 'CHECKED_IN'), 409, 'CONFLICT');
    error(await status(created, 'CANCELED'), 409, 'CONFLICT');
    error(await write('POST', route(`/appointments/${current.id}/reschedule`), { startsAt: fixture.at(14), expectedVersion: current.version }), 409, 'CONFLICT');
    const events = await db.appointmentEvent.findMany({ where: { tenantId: tenantId(), appointmentId: created.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map(item => item.toStatus)).toEqual(['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED']);
    expect(events.every(item => item.actorUserId === operator.id)).toBe(true);
    expect(await db.auditLog.count({ where: { tenantId: tenantId(), resourceId: created.id, action: 'appointment.status_changed' } })).toBe(3);
  });

  it('releases a canceled slot, rejects terminal changes and permits NO_SHOW only after the start', async () => {
    const fixture = await createBookingFixture();
    const created = await createAppointment(fixture);
    const canceled = await status(created, 'CANCELED');
    expect(canceled.statusCode, canceled.body).toBe(200);
    const terminal = canceled.json<AppointmentView>();
    expect((await availability(fixture)).slots.map(item => item.startsAt)).toContain(created.startsAt);
    expect((await createAppointment(fixture)).id).not.toBe(created.id);
    error(await status(terminal, 'CHECKED_IN'), 409, 'CONFLICT');
    const legacy = await insertLegacyAppointment(fixture, new Date(Date.now() - 60 * 60_000));
    expect(legacy.idempotencyKey).toBeNull();
    expect(legacy.requestHash).toBeNull();
    const noShow = await write('POST', route(`/appointments/${legacy.id}/status`), { status: 'NO_SHOW', expectedVersion: legacy.version, reason: 'Fictitious customer did not arrive' });
    expect(noShow.statusCode, noShow.body).toBe(200);
    expect(noShow.json<AppointmentView>().status).toBe('NO_SHOW');
    expect(await db.appointmentEvent.count({ where: { tenantId: tenantId(), appointmentId: legacy.id, toStatus: 'NO_SHOW' } })).toBe(1);
  });

  it('creates and deletes time off with scope checks and unit version updates', async () => {
    const fixture = await createBookingFixture();
    const before = await schedule(fixture);
    const block = await timeOff(fixture, fixture.at(10), fixture.at(11));
    const blocked = await schedule(fixture);
    expect(blocked.location.version).not.toBe(before.location.version);
    expect(blocked.timeOffs).toContainEqual(block);
    expect((await availability(fixture)).slots.map(item => item.startsAt)).not.toContain(fixture.at(10));
    error(await write('DELETE', route(`/time-offs/${block.id}`, 'b'), {}), 404, 'NOT_FOUND');
    const deleted = await write('DELETE', route(`/time-offs/${block.id}`), {});
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json()).toEqual({ deleted: true });
    const after = await schedule(fixture);
    expect(after.location.version).not.toBe(blocked.location.version);
    expect(after.timeOffs.map(item => item.id)).not.toContain(block.id);
    expect((await availability(fixture)).slots.map(item => item.startsAt)).toContain(fixture.at(10));
    error(await write('DELETE', route(`/time-offs/${block.id}`), {}), 404, 'NOT_FOUND');
  });

  it('refuses schedule changes or blocking periods that would invalidate confirmed reservations', async () => {
    const fixture = await createBookingFixture();
    await createAppointment(fixture);
    const before = await schedule(fixture);
    error(await write('PUT', route('/schedule'), scheduleInput(before, { businessHours: weekWindows([[540, 600], [780, 1080]]) })), 409, 'CONFLICT');
    error(await write('PUT', route('/schedule'), scheduleInput(before, { professionals: [{ professionalId: fixture.professionalId, windows: weekWindows([[660, 720], [780, 1020]]) }] })), 409, 'CONFLICT');
    for (const professionalId of [fixture.professionalId, null]) error(await write('POST', route('/time-offs'), { locationId: fixture.locationId, professionalId, startsAt: fixture.at(9, 45), endsAt: fixture.at(10, 15), reason: null }), 409, 'CONFLICT');
    expect(await schedule(fixture)).toEqual(before);
    const unrelated = await timeOff(fixture, fixture.at(9, 45), fixture.at(10, 15), fixture.otherProfessionalId);
    expect(unrelated.professionalId).toBe(fixture.otherProfessionalId);
    const afterBlock = await schedule(fixture);
    const changed = await write('PUT', route('/schedule'), scheduleInput(afterBlock, { professionals: [{ professionalId: fixture.otherProfessionalId, windows: weekWindows([[780, 1020]]) }] }));
    expect(changed.statusCode, changed.body).toBe(200);
  });

  it('serializes a reservation racing a time off so only one can occupy the period', async () => {
    const fixture = await createBookingFixture();
    const responses = await Promise.all([
      write('POST', route('/appointments'), appointmentInput(fixture)),
      write('POST', route('/time-offs'), { locationId: fixture.locationId, professionalId: fixture.professionalId, startsAt: fixture.at(10), endsAt: fixture.at(11), reason: null }),
    ]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409]);
    const bookings = await db.appointment.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } });
    const blocks = await db.timeOff.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } });
    expect(bookings + blocks).toBe(1);
    expect((await availability(fixture)).slots.map(slot => slot.startsAt)).not.toContain(fixture.at(10));
  });

  it('serializes a reservation racing a schedule closure without invalidating a confirmed booking', async () => {
    const fixture = await createBookingFixture();
    const current = await schedule(fixture);
    const [book, close] = await Promise.all([
      write('POST', route('/appointments'), appointmentInput(fixture)),
      write('PUT', route('/schedule'), scheduleInput(current, { businessHours: [] })),
    ]);
    expect([book.statusCode, close.statusCode]).toEqual(book.statusCode === 201 ? [201, 409] : [409, 200]);
    const saved = await schedule(fixture);
    expect(saved.businessHours).toEqual(book.statusCode === 201 ? current.businessHours : []);
    expect(await db.appointment.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(book.statusCode === 201 ? 1 : 0);
  });

  it('rejects invalid, expired or cross-unit time off without saving a block', async () => {
    const fixture = await createBookingFixture();
    const other = await createBookingFixture();
    const foreign = await createBookingFixture('foreign');
    const payload = { locationId: fixture.locationId, professionalId: fixture.professionalId, startsAt: fixture.at(10), endsAt: fixture.at(11), reason: null };
    for (const overrides of [
      { endsAt: fixture.at(10) }, { startsAt: 'not-an-instant' }, { startsAt: fixture.at(11), endsAt: fixture.at(10) },
      { startsAt: new Date(Date.now() - 60_000).toISOString() }, { endsAt: fixtureInstant(futureDate(370), 10) },
      { reason: 'x'.repeat(501) }, { tenantId: tenantId('foreign') },
    ]) error(await write('POST', route('/time-offs'), { ...payload, ...overrides }), 400, 'INVALID_INPUT');
    for (const professionalId of [other.professionalId, foreign.professionalId]) error(await write('POST', route('/time-offs'), { ...payload, professionalId }), 404, 'NOT_FOUND');
    error(await write('POST', route('/time-offs'), { ...payload, locationId: foreign.locationId }), 404, 'NOT_FOUND');
    expect(await db.timeOff.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(0);
  });

  it('requires trusted Origin and JSON for calendar writes, including PUT and DELETE', async () => {
    const fixture = await createBookingFixture();
    const current = await schedule(fixture);
    const appointment = await createAppointment(fixture);
    const block = await timeOff(fixture, fixture.at(15), fixture.at(16));
    for (const requestOrigin of [null, 'http://attacker.example.test']) {
      error(await write('POST', route('/appointments'), appointmentInput(fixture, { startsAt: fixture.at(14) }), { origin: requestOrigin }), 403, 'FORBIDDEN');
      error(await write('PUT', route('/schedule'), scheduleInput(current), { origin: requestOrigin }), 403, 'FORBIDDEN');
      error(await write('DELETE', route(`/time-offs/${block.id}`), {}, { origin: requestOrigin }), 403, 'FORBIDDEN');
      error(await write('POST', route(`/appointments/${appointment.id}/status`), { status: 'CANCELED', expectedVersion: appointment.version, reason: null }, { origin: requestOrigin }), 403, 'FORBIDDEN');
    }
    error(await write('POST', route('/appointments'), appointmentInput(fixture), { contentType: 'text/plain' }), 400, 'INVALID_INPUT');
    expect(await db.timeOff.count({ where: { tenantId: tenantId(), id: block.id } })).toBe(1);
    expect(await db.appointment.findUnique({ where: { id: appointment.id }, select: { status: true } })).toEqual({ status: 'CONFIRMED' });
  });

  it('rolls back appointment, snapshots and events when PostgreSQL rejects the audit insert', async () => {
    const fixture = await createBookingFixture();
    const appointment = await createAppointment(fixture);
    const before = await db.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { services: true, events: true } });
    const auditCount = await db.auditLog.count({ where: { tenantId: tenantId(), resourceId: appointment.id } });
    const failedInput = appointmentInput(fixture, { startsAt: fixture.at(14) });
    await failBookingAudits();
    try {
      expect((await write('POST', route('/appointments'), failedInput)).statusCode).toBe(500);
      expect((await write('POST', route(`/appointments/${appointment.id}/reschedule`), { startsAt: fixture.at(14), expectedVersion: appointment.version })).statusCode).toBe(500);
      expect((await status(appointment, 'CHECKED_IN')).statusCode).toBe(500);
      expect(await db.appointment.findUnique({ where: { id: appointment.id }, include: { services: true, events: true } })).toEqual(before);
      expect(await db.appointment.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(1);
      expect(await db.appointment.count({ where: { tenantId: tenantId(), idempotencyKey: failedInput.idempotencyKey } })).toBe(0);
      expect(await db.appointmentEvent.count({ where: { tenantId: tenantId(), locationId: fixture.locationId } })).toBe(1);
      expect(await db.auditLog.count({ where: { tenantId: tenantId(), resourceId: appointment.id } })).toBe(auditCount);
    } finally { await restoreBookingAudits(); }
    const retry = await write('POST', route('/appointments'), failedInput);
    expect(retry.statusCode, retry.body).toBe(201);
  });

  it('also rolls back schedule, time-off and customer writes when their audit fails', async () => {
    const fixture = await createBookingFixture();
    const block = await timeOff(fixture, fixture.at(15), fixture.at(16));
    const before = await schedule(fixture);
    const customer = await db.customer.findUniqueOrThrow({ where: { id: fixture.customerId } });
    const phone = newPhone();
    await failBookingAudits();
    try {
      expect((await write('PUT', route('/schedule'), scheduleInput(before, { professionals: [{ professionalId: fixture.professionalId, windows: weekWindows([[780, 1020]]) }] }))).statusCode).toBe(500);
      expect((await write('POST', route('/time-offs'), { locationId: fixture.locationId, professionalId: null, startsAt: fixture.at(13), endsAt: fixture.at(14), reason: null })).statusCode).toBe(500);
      expect((await write('DELETE', route(`/time-offs/${block.id}`), {})).statusCode).toBe(500);
      expect((await write('POST', route('/customers'), { name: 'Rolled back fictitious customer', phone, email: null, notes: null })).statusCode).toBe(500);
      expect((await write('PATCH', route(`/customers/${customer.id}`), { name: 'Rolled back fictitious update', phone: customer.phone, email: null, notes: null, expectedVersion: customer.version })).statusCode).toBe(500);
      expect(await schedule(fixture)).toEqual(before);
      expect(await db.customer.findUnique({ where: { id: customer.id } })).toEqual(customer);
      expect(await db.customer.count({ where: { tenantId: tenantId(), phone } })).toBe(0);
    } finally { await restoreBookingAudits(); }
  });
});
