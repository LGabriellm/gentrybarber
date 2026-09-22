import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookingDb as db, bookingTenant, bookingPrefix, bookingGet, bookingWrite, setupBookingTests, cleanupBookingTests, operator } from './booking-fixtures';

describe('Global administration', () => {
  const prefix = `${bookingPrefix}-admin`;
  const ownerId = `${prefix}-owner`;
  let planId: string;
  beforeAll(async () => {
    await setupBookingTests();
    planId = (await db.tenant.findUniqueOrThrow({ where: { id: bookingTenant() } })).planId;
    await db.role.upsert({ where: { key: 'OWNER' }, create: { key: 'OWNER', name: 'Owner' }, update: {} });
    await db.user.create({ data: { id: ownerId, name: 'Fictitious verified owner', email: `${prefix}@example.test`, emailVerified: true } });
  });
  afterAll(async () => {
    const where = { tenant: { slug: { startsWith: prefix } } };
    await db.auditLog.deleteMany({ where });
    await db.timeOff.deleteMany({ where });
    await db.professionalSchedule.deleteMany({ where });
    await db.businessHour.deleteMany({ where });
    await db.professionalService.deleteMany({ where });
    await db.professional.deleteMany({ where });
    await db.service.deleteMany({ where });
    await db.location.deleteMany({ where });
    await db.tenant.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { id: ownerId } });
    await cleanupBookingTests();
  });
  const input = () => ({ name: 'Barbearia de teste global', slug: `${prefix}-created`, planId, ownerEmail: `${prefix}@example.test`, timezone: 'America/Manaus' });
  it('requires verified global authority for every administrative endpoint', async () => {
    for (const path of ['stats', 'tenants', 'users', 'plans']) {
      expect((await bookingGet(`/v1/admin/${path}`, null)).statusCode).toBe(401);
      expect((await bookingGet(`/v1/admin/${path}`)).statusCode).toBe(403);
    }
    expect((await bookingWrite('POST', '/v1/admin/tenants', input())).statusCode).toBe(403);
    expect((await bookingGet(`/v1/admin/tenants/${bookingTenant()}`)).statusCode).toBe(403);
    expect((await bookingGet(`/v1/admin/tenants/${bookingTenant()}`, null)).statusCode).toBe(401);
    expect((await bookingWrite('PATCH', `/v1/admin/tenants/${bookingTenant()}`, {})).statusCode).toBe(403);
    expect((await bookingWrite('POST', `/v1/admin/tenants/${bookingTenant()}/locations`, {})).statusCode).toBe(403);
    expect((await bookingWrite('PATCH', `/v1/admin/tenants/${bookingTenant()}/locations/unknown`, {})).statusCode).toBe(403);
    expect((await bookingGet(`/v1/admin/users/${ownerId}`)).statusCode).toBe(403);
    expect((await bookingWrite('POST', `/v1/admin/tenants/${bookingTenant()}/services`, {})).statusCode).toBe(403);
    await db.user.update({ where: { id: operator.id }, data: { platformRole: 'SUPER_ADMIN' } });
  });
  it('validates origin, strict fields and verified owner before any write', async () => {
    expect((await bookingWrite('POST', '/v1/admin/tenants', input(), { origin: null })).statusCode).toBe(403);
    expect((await bookingWrite('POST', '/v1/admin/tenants', { ...input(), platformRole: 'SUPER_ADMIN' })).statusCode).toBe(400);
    expect((await bookingWrite('POST', '/v1/admin/tenants', { ...input(), slug: 'invalid/slug' })).statusCode).toBe(400);
    expect((await bookingWrite('POST', '/v1/admin/tenants', { ...input(), ownerEmail: 'unregistered@example.test' })).statusCode).toBe(404);
    expect(await db.tenant.count({ where: { slug: { startsWith: prefix } } })).toBe(0);
  });
  it('creates tenant, owner membership, unit and audit atomically, including concurrent retries', async () => {
    const responses = await Promise.all([bookingWrite('POST', '/v1/admin/tenants', input()), bookingWrite('POST', '/v1/admin/tenants', input())]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409]);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: input().slug }, include: { memberships: { include: { role: true } }, locations: true } });
    expect(tenant.memberships[0]).toMatchObject({ userId: ownerId, role: { key: 'OWNER' } });
    expect(tenant.locations[0]).toMatchObject({ timezone: 'America/Manaus', active: true });
    expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'admin.tenant_created', actorUserId: operator.id } })).toBe(1);
    const list = await bookingGet(`/v1/admin/tenants?q=${input().slug}`);
    expect(list.json().items[0].memberships[0].user.email).toBe(input().ownerEmail);
  });
  it('filters and paginates global data without silent truncation', async () => {
    await db.tenant.createMany({ data: Array.from({ length: 26 }, (_, index) => ({ name: `Pagination ${index}`, slug: `${prefix}-page-${index}`, planId, status: index === 0 ? 'SUSPENDED' as const : 'ACTIVE' as const })) });
    const first = (await bookingGet(`/v1/admin/tenants?q=${prefix}-page`)).json();
    const second = (await bookingGet(`/v1/admin/tenants?q=${prefix}-page&page=2`)).json();
    expect(first).toMatchObject({ total: 26, page: 1, pageSize: 25 }); expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(1);
    expect(first.items.map((item: { id: string }) => item.id)).not.toContain(second.items[0].id);
    expect((await bookingGet(`/v1/admin/tenants?q=${prefix}-page&status=SUSPENDED`)).json().total).toBe(1);
    expect((await bookingGet(`/v1/admin/users?q=${encodeURIComponent(input().ownerEmail)}&status=verified`)).json().total).toBe(1);
    expect((await bookingGet('/v1/admin/tenants?take=500')).statusCode).toBe(400);
    expect((await bookingGet('/v1/admin/users?page=0')).statusCode).toBe(400);
  });
  it('rejects stale status changes and audits valid updates', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: input().slug } });
    const payload = { planId, status: 'SUSPENDED', expectedUpdatedAt: tenant.updatedAt.toISOString() };
    expect((await bookingWrite('PATCH', `/v1/admin/tenants/${tenant.id}`, payload)).statusCode).toBe(200);
    expect((await bookingWrite('PATCH', `/v1/admin/tenants/${tenant.id}`, payload)).statusCode).toBe(409);
    expect(await db.auditLog.count({ where: { tenantId: tenant.id, action: 'admin.tenant_updated' } })).toBe(1);
  });
  it('edits contact and configuration without moving existing units or allowing unknown fields', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: input().slug }, include: { locations: true } });
    const path = `/v1/admin/tenants/${tenant.id}`;
    const detail = (await bookingGet(path)).json();
    expect(detail.memberships[0].user.email).toBe(input().ownerEmail);
    expect(detail.siteConfiguration).toBeNull();
    const payload = { name: 'Barbearia atualizada', phone: '+55 11 99999-0000', whatsapp: null, email: 'contato@example.test', timezone: 'America/Sao_Paulo', status: 'ACTIVE', planId, expectedUpdatedAt: detail.updatedAt };
    expect((await bookingWrite('PATCH', path, payload, { origin: null })).statusCode).toBe(403);
    expect((await bookingWrite('PATCH', path, { ...payload, slug: 'forbidden-change' })).statusCode).toBe(400);
    expect((await bookingWrite('PATCH', path, { ...payload, timezone: 'Not/AZone' })).statusCode).toBe(400);
    const results = await Promise.all([bookingWrite('PATCH', path, payload), bookingWrite('PATCH', path, payload)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.tenant.findUnique({ where: { id: tenant.id } })).toMatchObject({ name: payload.name, email: payload.email, timezone: payload.timezone, slug: tenant.slug });
    expect((await db.location.findUniqueOrThrow({ where: { id: tenant.locations[0]!.id } })).timezone).toBe('America/Manaus');
    expect((await bookingGet(`${path}?tenantId=other`)).statusCode).toBe(400);
    expect((await bookingGet('/v1/admin/tenants/unknown')).statusCode).toBe(404);
  });
  it('scopes unit management to the selected tenant and preserves version and feature checks', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: input().slug }, include: { locations: true } });
    const path = `/v1/admin/tenants/${tenant.id}/locations`;
    const payload = { name: 'Unidade administrativa', phone: '11999990000', address: { city: 'São Paulo' }, active: false };
    expect((await bookingWrite('POST', path, payload, { origin: null })).statusCode).toBe(403);
    expect((await bookingWrite('POST', path, { ...payload, tenantId: bookingTenant() })).statusCode).toBe(400);
    const created = await bookingWrite('POST', path, payload);
    expect(created.statusCode, created.body).toBe(201);
    const location = created.json();
    expect(location.tenantId).toBe(tenant.id);
    const update = { ...payload, name: 'Unidade revisada', expectedVersion: location.version };
    expect((await bookingWrite('PATCH', `/v1/admin/tenants/${bookingTenant()}/locations/${location.id}`, update)).statusCode).toBe(404);
    expect((await bookingWrite('PATCH', `${path}/${location.id}`, update)).statusCode).toBe(200);
    expect((await bookingWrite('PATCH', `${path}/${location.id}`, update)).statusCode).toBe(409);
    expect((await bookingWrite('POST', path, { ...payload, name: 'Outra unidade ativa', active: true })).statusCode).toBe(403);
    expect(await db.auditLog.count({ where: { tenantId: tenant.id, resourceId: location.id, actorUserId: operator.id, action: 'location.updated' } })).toBe(1);
  });
  it('manages user identity, password, sessions and tenant memberships with audits', async () => {
    const detail = (await bookingGet(`/v1/admin/users/${ownerId}`)).json();
    expect(detail).toMatchObject({ id: ownerId, hasPassword: false, _count: { sessions: 0 } });
    expect(detail.accounts).toBeUndefined();
    const update = { action: 'update', name: 'Owner administrado', email: `${prefix}-managed@example.test`, platformRole: 'USER', emailVerified: true, expectedUpdatedAt: detail.updatedAt };
    expect((await bookingWrite('PATCH', `/v1/admin/users/${ownerId}`, update)).statusCode).toBe(200);
    expect((await bookingWrite('PATCH', `/v1/admin/users/${ownerId}`, update)).statusCode).toBe(409);
    expect((await bookingWrite('PATCH', `/v1/admin/users/${ownerId}`, { action: 'set_password', password: 'short' })).statusCode).toBe(400);
    expect((await bookingWrite('PATCH', `/v1/admin/users/${ownerId}`, { action: 'set_password', password: 'A secure fixture password 123' })).statusCode).toBe(200);
    const account = await db.account.findFirst({ where: { userId: ownerId, providerId: 'credential' } });
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain('secure fixture');
    expect((await bookingWrite('POST', `/v1/admin/users/${ownerId}/password-reset`, {})).statusCode).toBe(201);
    expect(await db.auditLog.count({ where: { actorUserId: operator.id, resourceId: ownerId, action: { in: ['admin.user_updated', 'admin.user_password_set', 'admin.user_password_reset_requested'] } } })).toBe(3);
  });
  it('manages catalog and business hours through platform authority without cross-tenant access', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: input().slug }, include: { locations: true } });
    const location = tenant.locations.find(item => item.active)!;
    const created = await bookingWrite('POST', `/v1/admin/tenants/${tenant.id}/services`, { locationId: location.id, name: 'Serviço administrativo', description: null, durationMinutes: 45, priceCents: 5500, active: true });
    expect(created.statusCode, created.body).toBe(201);
    const service = created.json();
    expect(service.locationId).toBe(location.id);
    expect((await bookingGet(`/v1/admin/tenants/${tenant.id}/services`)).json().items).toEqual(expect.arrayContaining([expect.objectContaining({ id: service.id })]));
    expect((await bookingWrite('PATCH', `/v1/admin/tenants/${bookingTenant()}/services/${service.id}`, { name: service.name, description: null, durationMinutes: 45, priceCents: 5500, active: false, expectedVersion: service.version })).statusCode).toBe(404);
    const schedule = (await bookingGet(`/v1/admin/tenants/${tenant.id}/schedule?locationId=${location.id}`)).json();
    expect((await bookingWrite('PUT', `/v1/admin/tenants/${tenant.id}/schedule`, { locationId: location.id, expectedVersion: schedule.location.version, businessHours: [{ weekday: 1, startMinute: 540, endMinute: 1080 }], professionals: [] })).statusCode).toBe(200);
    expect(await db.businessHour.count({ where: { tenantId: tenant.id, locationId: location.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { tenantId: tenant.id, actorUserId: operator.id, action: { in: ['service.created', 'schedule.updated'] } } })).toBe(2);
  });
});
