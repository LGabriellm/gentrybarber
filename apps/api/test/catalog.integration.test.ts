import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { emailJobSchema, type EmailMessage, type NotificationProvider } from '@platform/notifications';
import type { CatalogProfessional, CatalogService, CreateProfessionalInput, CreateServiceInput, ProfessionalCatalog, ServiceCatalog } from '@platform/types';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error('DATABASE_TEST_URL is required for the catalog API integration suite.');
const target = new URL(databaseUrl);
if (!['postgresql:', 'postgres:'].includes(target.protocol) || !decodeURIComponent(target.pathname.slice(1)).endsWith('_test')) {
  throw new Error('Catalog integration tests require a dedicated PostgreSQL database whose name ends in _test.');
}

class CapturedEmail implements NotificationProvider {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(emailJobSchema.parse(message)); }
  verificationFor(recipient: string) {
    const message = this.messages.find(item => item.to === recipient);
    const address = message?.text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!address) throw new Error('Missing verification message for the fictitious catalog account.');
    return new URL(address);
  }
}

const prefix = `catalog-it-${randomBytes(8).toString('hex')}`;
const db = createDatabase(databaseUrl);
const email = new CapturedEmail();
const origin = 'http://localhost:3001';
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Catalog integration', PLATFORM_DOMAIN: 'platform.test',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: origin,
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Integration <noreply@example.test>',
});
const tenantKeys = ['a', 'b', 'limited', 'service-only', 'professional-only', 'disabled', 'membership-inactive', 'tenant-inactive'] as const;
type TenantKey = typeof tenantKeys[number];
const tenantId = (key: TenantKey) => `${prefix}-${key}`;
const locationId = (key: TenantKey) => `${tenantId(key)}-location`;
const planId = `${prefix}-plan`;
const roles = { owner: `${prefix}-owner`, limited: `${prefix}-limited`, services: `${prefix}-services`, professionals: `${prefix}-professionals` };
const ids = {
  secondLocation: `${prefix}-location-a2`, inactiveLocation: `${prefix}-location-inactive`,
  service: `${prefix}-service-a`, inactiveService: `${prefix}-service-inactive`,
  secondService: `${prefix}-service-a2`, inactiveLocationService: `${prefix}-service-inactive-location`,
  foreignService: `${prefix}-service-b`, professional: `${prefix}-professional-a`,
  inactiveProfessional: `${prefix}-professional-inactive`, inactiveLocationProfessional: `${prefix}-professional-inactive-location`,
  foreignProfessional: `${prefix}-professional-b`, site: `${prefix}-site`, version: `${prefix}-version`,
};
const ownedFeatures: string[] = [];
const ownedPermissions: string[] = [];
const ownedThemes: string[] = [];
const recipient = `${prefix}@example.test`;
const clientSubnet = [...randomBytes(2)].map(value => (value % 254) + 1).join('.');
const rateLimitScope = { key: { startsWith: `127.${clientSubnet}.` } };
let previousRateLimitIds: string[] = [];
let requestCount = 0;
let userId: string | undefined;
let cookie: string;
type Application = Awaited<ReturnType<typeof createApplication>>;
type ApiServer = ReturnType<ReturnType<Application['getHttpAdapter']>['getInstance']>;
let app: Application | undefined;
let server: ApiServer;
const auditFailureName = `catalog_audit_fail_${randomBytes(8).toString('hex')}`;
let auditFailureFunction = false;
let auditFailureTrigger = false;

function remoteAddress() { return `127.${clientSubnet}.${(requestCount++ % 250) + 1}`; }
function route(resource: 'services' | 'professionals', tenant: TenantKey = 'a', id?: string) {
  return `/v1/tenants/${tenantId(tenant)}/${resource}${id ? `/${id}` : ''}`;
}
function get(url: string, session: string | null = cookie) {
  return server.inject({ method: 'GET', url, remoteAddress: remoteAddress(), headers: session ? { cookie: session } : {} });
}
function write(method: 'POST' | 'PATCH', url: string, payload: unknown, options: { session?: string | null; origin?: string | null; contentType?: string } = {}) {
  const session = options.session === undefined ? cookie : options.session;
  const requestOrigin = options.origin === undefined ? origin : options.origin;
  return server.inject({
    method, url, remoteAddress: remoteAddress(), payload: JSON.stringify(payload),
    headers: { 'content-type': options.contentType ?? 'application/json', ...(session ? { cookie: session } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) },
  });
}
const serviceInput = (overrides: Partial<CreateServiceInput> = {}): CreateServiceInput => ({
  locationId: locationId('a'), name: `Fictitious service ${randomUUID()}`, description: 'Private fixture description',
  durationMinutes: 30, priceCents: 4500, active: true, ...overrides,
});
const professionalInput = (overrides: Partial<CreateProfessionalInput> = {}): CreateProfessionalInput => ({
  locationId: locationId('a'), name: `Fictitious professional ${randomUUID()}`, bio: 'Private fixture biography',
  active: true, serviceIds: [ids.service], ...overrides,
});
function serviceUpdate(item: CatalogService, overrides: Record<string, unknown> = {}) {
  return { name: item.name, description: item.description, durationMinutes: item.durationMinutes, priceCents: item.priceCents, active: item.active, expectedVersion: item.version, ...overrides };
}
function professionalUpdate(item: CatalogProfessional, overrides: Record<string, unknown> = {}) {
  return { name: item.name, bio: item.bio, active: item.active, serviceIds: item.serviceIds, expectedVersion: item.version, ...overrides };
}
function expectError(response: LightMyRequestResponse, status: number, error: string) {
  expect(response.statusCode, response.body).toBe(status);
  expect(response.json()).toEqual({ error });
  expect(response.headers['cache-control']).toBe('no-store');
}
async function createService(overrides: Partial<CreateServiceInput> = {}) {
  const response = await write('POST', route('services'), serviceInput(overrides));
  expect(response.statusCode, response.body).toBe(201);
  return response.json<CatalogService>();
}
async function createProfessional(overrides: Partial<CreateProfessionalInput> = {}) {
  const response = await write('POST', route('professionals'), professionalInput(overrides));
  expect(response.statusCode, response.body).toBe(201);
  return response.json<CatalogProfessional>();
}
async function removeAuditFailure() {
  if (auditFailureTrigger) {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${auditFailureName}" ON audit_logs`);
    auditFailureTrigger = false;
  }
  if (auditFailureFunction) {
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${auditFailureName}"()`);
    auditFailureFunction = false;
  }
}

beforeAll(async () => {
  previousRateLimitIds = (await db.rateLimit.findMany({ where: rateLimitScope, select: { id: true } })).map(item => item.id);
  await db.plan.create({ data: { id: planId, key: planId, name: 'A configurable catalog fixture plan' } });
  let bookingFeatureId = '';
  for (const key of ['booking', 'website'] as const) {
    const id = `${prefix}-feature-${key}`;
    const feature = await db.feature.upsert({ where: { key }, create: { id, key, name: key }, update: {} });
    if (feature.id === id) ownedFeatures.push(id);
    if (key === 'booking') bookingFeatureId = feature.id;
    await db.planFeature.create({ data: { planId, featureId: feature.id, enabled: true } });
  }
  await db.role.createMany({ data: Object.values(roles).map(id => ({ id, key: id, name: 'Catalog fixture role' })) });
  for (const key of ['services.manage', 'professionals.manage'] as const) {
    const id = `${prefix}-permission-${key}`;
    const permission = await db.permission.upsert({ where: { key }, create: { id, key, description: key }, update: {} });
    if (permission.id === id) ownedPermissions.push(id);
    await db.rolePermission.createMany({ data: [roles.owner, key === 'services.manage' ? roles.services : roles.professionals].map(roleId => ({ roleId, permissionId: permission.id })) });
  }
  await db.tenant.createMany({ data: tenantKeys.map(key => ({ id: tenantId(key), slug: tenantId(key), name: `Catalog fixture ${key}`, planId, status: key === 'tenant-inactive' ? 'SUSPENDED' as const : 'ACTIVE' as const })) });
  await db.tenantFeatureOverride.create({ data: { tenantId: tenantId('disabled'), featureId: bookingFeatureId, enabled: false, reason: 'Explicit catalog fixture denial' } });
  await db.location.createMany({ data: [
    ...tenantKeys.map(key => ({ id: locationId(key), tenantId: tenantId(key), slug: 'main', name: `Fixture location ${key}` })),
    { id: ids.secondLocation, tenantId: tenantId('a'), slug: 'second', name: 'Second fixture location' },
    { id: ids.inactiveLocation, tenantId: tenantId('a'), slug: 'inactive', name: 'Inactive fixture location', active: false },
  ] });
  await db.service.createMany({ data: [
    { id: ids.service, tenantId: tenantId('a'), locationId: locationId('a'), name: 'Fixture active service', active: true },
    { id: ids.inactiveService, tenantId: tenantId('a'), locationId: locationId('a'), name: 'Fixture inactive service', active: false },
    { id: ids.secondService, tenantId: tenantId('a'), locationId: ids.secondLocation, name: 'Fixture second unit service', active: true },
    { id: ids.inactiveLocationService, tenantId: tenantId('a'), locationId: ids.inactiveLocation, name: 'Fixture service in inactive unit', active: true },
    { id: ids.foreignService, tenantId: tenantId('b'), locationId: locationId('b'), name: 'Fixture foreign service', active: true },
  ].map(item => ({ ...item, durationMinutes: 30, priceCents: 5000 })) });
  await db.professional.createMany({ data: [
    { id: ids.professional, tenantId: tenantId('a'), locationId: locationId('a'), name: 'Fixture active professional', active: true },
    { id: ids.inactiveProfessional, tenantId: tenantId('a'), locationId: locationId('a'), name: 'Fixture inactive professional', active: false },
    { id: ids.inactiveLocationProfessional, tenantId: tenantId('a'), locationId: ids.inactiveLocation, name: 'Fixture professional in inactive unit', active: true },
    { id: ids.foreignProfessional, tenantId: tenantId('b'), locationId: locationId('b'), name: 'Fixture foreign professional', active: true },
  ] });
  await db.professionalService.create({ data: { tenantId: tenantId('a'), locationId: locationId('a'), professionalId: ids.professional, serviceId: ids.service } });
  const themeId = `${prefix}-theme`;
  const theme = await db.theme.upsert({ where: { key: 'classic' }, create: { id: themeId, key: 'classic', name: 'Classic fixture renderer', kind: 'TEMPLATE' }, update: {} });
  if (theme.id === themeId) ownedThemes.push(theme.id);
  await db.themeVersion.create({ data: { id: ids.version, tenantId: tenantId('a'), themeId: theme.id, version: 1, status: 'PUBLISHED', config: {}, publishedAt: new Date() } });
  await db.siteConfiguration.create({ data: { id: ids.site, tenantId: tenantId('a'), themeId: theme.id, publishedThemeVersionId: ids.version, title: 'Fictitious catalog site', description: 'Fictitious catalog integration data', published: true } });

  app = await createApplication(config, new FoundationServices(db, createAuth(db, config, email), config));
  server = app.getHttpAdapter().getInstance();
  const password = `Fixture-${randomBytes(24).toString('hex')}`;
  const signup = await write('POST', '/api/auth/sign-up/email', { email: recipient, password, name: 'Fictitious catalog operator' }, { session: null });
  expect(signup.statusCode, signup.body).toBe(200);
  userId = signup.json<{ user: { id: string } }>().user.id;
  const verification = email.verificationFor(recipient);
  const verified = await get(`${verification.pathname}${verification.search}`, null);
  expect([200, 302]).toContain(verified.statusCode);
  const login = await write('POST', '/api/auth/sign-in/email', { email: recipient, password }, { session: null });
  expect(login.statusCode, login.body).toBe(200);
  const setCookie = login.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
  expect(cookies.some(value => value.startsWith('better-auth.session_token='))).toBe(true);
  cookie = cookies.map(value => value.split(';')[0]).join('; ');
  await db.membership.createMany({ data: tenantKeys.filter(key => key !== 'b').map(key => ({
    userId: userId!, tenantId: tenantId(key), status: key === 'membership-inactive' ? 'SUSPENDED' as const : 'ACTIVE' as const,
    roleId: key === 'limited' ? roles.limited : key === 'service-only' ? roles.services : key === 'professional-only' ? roles.professionals : roles.owner,
  })) });
}, 60_000);

afterAll(async () => {
  try {
    await app?.close();
    await removeAuditFailure();
    const tenantIds = tenantKeys.map(tenantId);
    const ownUsers = (await db.user.findMany({ where: { email: recipient }, select: { id: true } })).map(item => item.id);
    await db.$transaction([
      db.rateLimit.deleteMany({ where: { ...rateLimitScope, id: { notIn: previousRateLimitIds } } }),
      db.verification.deleteMany({ where: { OR: [{ value: { in: ownUsers } }, { identifier: recipient }] } }),
      db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.siteConfiguration.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.themeVersion.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.professionalService.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.professional.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.service.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.location.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      db.user.deleteMany({ where: { id: { in: ownUsers } } }),
      db.role.deleteMany({ where: { id: { in: Object.values(roles) } } }),
      db.plan.deleteMany({ where: { id: planId } }),
      db.theme.deleteMany({ where: { id: { in: ownedThemes } } }),
      db.permission.deleteMany({ where: { id: { in: ownedPermissions } } }),
      db.feature.deleteMany({ where: { id: { in: ownedFeatures } } }),
    ]);
  } finally { await db.$disconnect(); }
}, 30_000);

describe('Catalog API with real PostgreSQL and verified Better Auth sessions', () => {
  it('requires verified sessions on reads and writes for both resources', async () => {
    for (const resource of ['services', 'professionals'] as const) {
      for (const session of [null, 'better-auth.session_token=forged']) {
        expectError(await get(route(resource), session), 401, 'UNAUTHENTICATED');
        expectError(await write('POST', route(resource), resource === 'services' ? serviceInput() : professionalInput(), { session }), 401, 'UNAUTHENTICATED');
      }
    }
    await db.user.update({ where: { id: userId }, data: { emailVerified: false } });
    try {
      for (const resource of ['services', 'professionals'] as const) expectError(await get(route(resource)), 401, 'UNAUTHENTICATED');
    } finally { await db.user.update({ where: { id: userId }, data: { emailVerified: true } }); }
  });

  it.each([
    ['limited', 403, 'FORBIDDEN'], ['disabled', 403, 'FEATURE_DISABLED'],
    ['membership-inactive', 404, 'NOT_FOUND'], ['tenant-inactive', 404, 'NOT_FOUND'], ['b', 404, 'NOT_FOUND'],
  ] as const)('rejects reads and writes for the %s tenant', async (tenant, status, error) => {
    for (const resource of ['services', 'professionals'] as const) {
      expectError(await get(route(resource, tenant)), status, error);
      const input = resource === 'services' ? serviceInput({ locationId: locationId(tenant) }) : professionalInput({ locationId: locationId(tenant), serviceIds: [] });
      expectError(await write('POST', route(resource, tenant), input), status, error);
      expectError(await write('PATCH', route(resource, tenant, `${prefix}-missing`), { expectedVersion: 1, ...input }), status, error);
    }
  });

  it('checks the distinct management permission for each catalog', async () => {
    expect((await get(route('services', 'service-only'))).statusCode).toBe(200);
    expectError(await get(route('professionals', 'service-only')), 403, 'FORBIDDEN');
    expect((await get(route('professionals', 'professional-only'))).statusCode).toBe(200);
    expectError(await get(route('services', 'professional-only')), 403, 'FORBIDDEN');
  });

  it('lists only the authorized tenant, including inactive records and units without authority fields', async () => {
    const services = await get(route('services'));
    const professionals = await get(route('professionals'));
    expect(services.statusCode).toBe(200);
    expect(professionals.statusCode).toBe(200);
    const catalog = services.json<ServiceCatalog>();
    const team = professionals.json<ProfessionalCatalog>();
    expect(catalog.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.service }), expect.objectContaining({ id: ids.inactiveService, active: false })]));
    expect(catalog.locations).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.inactiveLocation, active: false })]));
    expect(team.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.professional, serviceIds: [ids.service] }), expect.objectContaining({ id: ids.inactiveProfessional, active: false })]));
    expect(team.services).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.inactiveService, active: false })]));
    for (const response of [services, professionals]) {
      expect(response.body).not.toContain(tenantId('b'));
      expect(response.body).not.toContain('tenantId');
      expect(response.body).not.toContain('actorUserId');
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('creates, edits, deactivates and reactivates a service while preserving its ID and auditing the actor', async () => {
    const created = await createService({ name: '  Fictitious precision cut  ', description: 'Confidential fixture text' });
    expect(created).toMatchObject({ name: 'Fictitious precision cut', priceCents: 4500, durationMinutes: 30, active: true, locationId: locationId('a') });
    expect(typeof created.version).toBe('number');
    const changed = await write('PATCH', route('services', 'a', created.id), serviceUpdate(created, { name: 'Fictitious revised service', description: null, priceCents: 0, durationMinutes: 1, active: false }));
    expect(changed.statusCode, changed.body).toBe(200);
    const inactive = changed.json<CatalogService>();
    expect(inactive).toMatchObject({ id: created.id, description: null, priceCents: 0, durationMinutes: 1, active: false });
    expect((await get(route('services'))).json<ServiceCatalog>().items).toContainEqual(inactive);
    const reactivated = await write('PATCH', route('services', 'a', created.id), serviceUpdate(inactive, { active: true }));
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json<CatalogService>().id).toBe(created.id);
    expect(await db.service.count({ where: { tenantId: tenantId('a'), id: created.id } })).toBe(1);
    const audit = await db.auditLog.findMany({ where: { tenantId: tenantId('a'), resourceId: created.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map(item => item.action)).toEqual(['service.created', 'service.updated', 'service.updated']);
    for (const entry of audit) expect(entry).toMatchObject({ actorUserId: userId, tenantId: tenantId('a'), resource: 'Service', resourceId: created.id });
    expect(JSON.stringify(audit)).not.toContain('Confidential fixture text');
    expect(JSON.stringify(audit)).not.toContain(cookie);
  });

  it('creates and edits a professional, preserves inactive service links, and keeps deactivated records', async () => {
    const created = await createProfessional({ name: '  Fictitious barber  ', bio: 'Confidential fixture biography', serviceIds: [ids.service, ids.inactiveService] });
    expect(created.name).toBe('Fictitious barber');
    expect(created.serviceIds.sort()).toEqual([ids.service, ids.inactiveService].sort());
    const changed = await write('PATCH', route('professionals', 'a', created.id), professionalUpdate(created, { bio: null, active: false, serviceIds: [ids.inactiveService] }));
    expect(changed.statusCode, changed.body).toBe(200);
    const inactive = changed.json<CatalogProfessional>();
    expect(inactive).toMatchObject({ id: created.id, bio: null, active: false, serviceIds: [ids.inactiveService] });
    expect((await get(route('professionals'))).json<ProfessionalCatalog>().items).toContainEqual(inactive);
    const reactivated = await write('PATCH', route('professionals', 'a', created.id), professionalUpdate(inactive, { active: true, serviceIds: [] }));
    expect(reactivated.statusCode).toBe(200);
    expect(await db.professionalService.count({ where: { tenantId: tenantId('a'), professionalId: created.id } })).toBe(0);
    expect(await db.professional.count({ where: { tenantId: tenantId('a'), id: created.id } })).toBe(1);
    const audit = await db.auditLog.findMany({ where: { tenantId: tenantId('a'), resourceId: created.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map(item => item.action)).toEqual(['professional.created', 'professional.updated', 'professional.updated']);
    for (const entry of audit) expect(entry).toMatchObject({ actorUserId: userId, tenantId: tenantId('a'), resource: 'Professional', resourceId: created.id });
    expect(JSON.stringify(audit)).not.toContain('Confidential fixture biography');
  });

  it('does not reveal or modify resources selected by another tenant ID', async () => {
    const foreignService = await db.service.findUniqueOrThrow({ where: { id: ids.foreignService } });
    const foreignProfessional = await db.professional.findUniqueOrThrow({ where: { id: ids.foreignProfessional } });
    expectError(await write('PATCH', route('services', 'a', ids.foreignService), serviceUpdate(foreignService as unknown as CatalogService, { name: 'Unauthorized service edit' })), 404, 'NOT_FOUND');
    expectError(await write('PATCH', route('professionals', 'a', ids.foreignProfessional), professionalUpdate({ ...(foreignProfessional as unknown as CatalogProfessional), serviceIds: [] }, { name: 'Unauthorized professional edit' })), 404, 'NOT_FOUND');
    expect(await db.service.findUnique({ where: { id: ids.foreignService } })).toEqual(foreignService);
    expect(await db.professional.findUnique({ where: { id: ids.foreignProfessional } })).toEqual(foreignProfessional);
    expect(await db.auditLog.count({ where: { tenantId: tenantId('b') } })).toBe(0);
  });

  it('rejects foreign, unknown and inactive locations on creation', async () => {
    for (const invalidLocation of [locationId('b'), `${prefix}-unknown-location`, ids.inactiveLocation]) {
      expectError(await write('POST', route('services'), serviceInput({ locationId: invalidLocation })), 404, 'NOT_FOUND');
      expectError(await write('POST', route('professionals'), professionalInput({ locationId: invalidLocation, serviceIds: [] })), 404, 'NOT_FOUND');
    }
  });

  it('rejects professional service links from another tenant or another unit on create and update', async () => {
    const professional = await createProfessional();
    const before = await db.professional.findUniqueOrThrow({ where: { id: professional.id } });
    const auditCount = await db.auditLog.count({ where: { tenantId: tenantId('a') } });
    for (const invalidService of [ids.foreignService, ids.secondService, `${prefix}-missing-service`]) {
      expectError(await write('POST', route('professionals'), professionalInput({ serviceIds: [invalidService] })), 404, 'NOT_FOUND');
      expectError(await write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional, { name: 'Rejected relation change', serviceIds: [invalidService] })), 404, 'NOT_FOUND');
    }
    expect(await db.professional.findUnique({ where: { id: professional.id } })).toEqual(before);
    expect(await db.professionalService.findMany({ where: { tenantId: tenantId('a'), professionalId: professional.id }, select: { serviceId: true } })).toEqual([{ serviceId: ids.service }]);
    expect(await db.auditLog.count({ where: { tenantId: tenantId('a') } })).toBe(auditCount);
  });

  it('rejects unknown or privileged input fields and changing a saved location', async () => {
    for (const field of ['tenantId', 'actorUserId', 'createdAt', 'role', 'photoUrl']) {
      expectError(await write('POST', route('services'), { ...serviceInput(), [field]: 'untrusted' }), 400, 'INVALID_INPUT');
      expectError(await write('POST', route('professionals'), { ...professionalInput(), [field]: 'untrusted' }), 400, 'INVALID_INPUT');
    }
    const service = await createService();
    const professional = await createProfessional();
    expectError(await write('PATCH', route('services', 'a', service.id), serviceUpdate(service, { locationId: ids.secondLocation })), 400, 'INVALID_INPUT');
    expectError(await write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional, { locationId: ids.secondLocation })), 400, 'INVALID_INPUT');
  });

  it('rejects invalid prices, durations and text limits without creating records or audit entries', async () => {
    const counts = [await db.service.count({ where: { tenantId: tenantId('a') } }), await db.auditLog.count({ where: { tenantId: tenantId('a') } })];
    for (const invalid of [
      ...[-1, 0.5, 100_000_001, '4500'].map(priceCents => ({ priceCents })),
      ...[0, 1.5, 1441, '30'].map(durationMinutes => ({ durationMinutes })),
      { name: '   ' }, { name: 'x'.repeat(121) }, { description: 'x'.repeat(2001) }, { active: 'true' },
    ]) expectError(await write('POST', route('services'), { ...serviceInput(), ...invalid }), 400, 'INVALID_INPUT');
    expect([await db.service.count({ where: { tenantId: tenantId('a') } }), await db.auditLog.count({ where: { tenantId: tenantId('a') } })]).toEqual(counts);
  });

  it('rejects duplicate, oversized and malformed professional assignments and invalid text', async () => {
    for (const invalid of [
      { serviceIds: [ids.service, ids.service] }, { serviceIds: Array.from({ length: 101 }, (_, index) => `${prefix}-${index}`) },
      { serviceIds: [1] }, { serviceIds: 'all' }, { bio: 'x'.repeat(2001) }, { name: '   ' }, { name: 'x'.repeat(121) },
    ]) expectError(await write('POST', route('professionals'), { ...professionalInput(), ...invalid }), 400, 'INVALID_INPUT');
  });

  it.each([null, 'http://attacker.example.test'])('rejects create and update requests with untrusted Origin %s', async requestOrigin => {
    const service = await createService();
    const professional = await createProfessional();
    const auditCount = await db.auditLog.count({ where: { tenantId: tenantId('a') } });
    expectError(await write('POST', route('services'), serviceInput(), { origin: requestOrigin }), 403, 'FORBIDDEN');
    expectError(await write('POST', route('professionals'), professionalInput(), { origin: requestOrigin }), 403, 'FORBIDDEN');
    expectError(await write('PATCH', route('services', 'a', service.id), serviceUpdate(service), { origin: requestOrigin }), 403, 'FORBIDDEN');
    expectError(await write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional), { origin: requestOrigin }), 403, 'FORBIDDEN');
    expect(await db.auditLog.count({ where: { tenantId: tenantId('a') } })).toBe(auditCount);
  });

  it('requires JSON on writes and a valid revision on updates', async () => {
    const service = await createService();
    const professional = await createProfessional();
    expectError(await write('POST', route('services'), serviceInput(), { contentType: 'text/plain' }), 400, 'INVALID_INPUT');
    expectError(await write('POST', route('professionals'), professionalInput(), { contentType: 'text/plain' }), 400, 'INVALID_INPUT');
    for (const expectedVersion of [undefined, 'not-a-number', -1, 0]) {
      expectError(await write('PATCH', route('services', 'a', service.id), serviceUpdate(service, { expectedVersion })), 400, 'INVALID_INPUT');
      expectError(await write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional, { expectedVersion })), 400, 'INVALID_INPUT');
    }
  });

  it('allows exactly one concurrent update for a service revision and does not audit the rejected edit', async () => {
    const service = await createService();
    const responses = await Promise.all(['First concurrent service edit', 'Second concurrent service edit'].map(name => write('PATCH', route('services', 'a', service.id), serviceUpdate(service, { name }))));
    expect(responses.map(item => item.statusCode).sort()).toEqual([200, 409]);
    const rejected = responses.find(item => item.statusCode === 409)!;
    expectError(rejected, 409, 'CONFLICT');
    const winner = responses.find(item => item.statusCode === 200)!.json<CatalogService>();
    expect(winner.version).not.toBe(service.version);
    expect(await db.service.findUnique({ where: { id: service.id }, select: { name: true } })).toEqual({ name: winner.name });
    expect(await db.auditLog.count({ where: { tenantId: tenantId('a'), resourceId: service.id, action: 'service.updated' } })).toBe(1);
    expectError(await write('PATCH', route('services', 'a', service.id), serviceUpdate(service)), 409, 'CONFLICT');
  });

  it('allows exactly one concurrent professional revision and commits only the winning service links', async () => {
    const professional = await createProfessional();
    const responses = await Promise.all([[ids.inactiveService], []].map(serviceIds => write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional, { serviceIds }))));
    expect(responses.map(item => item.statusCode).sort()).toEqual([200, 409]);
    expectError(responses.find(item => item.statusCode === 409)!, 409, 'CONFLICT');
    const winner = responses.find(item => item.statusCode === 200)!.json<CatalogProfessional>();
    expect(winner.version).not.toBe(professional.version);
    const assignments = await db.professionalService.findMany({ where: { tenantId: tenantId('a'), professionalId: professional.id }, select: { serviceId: true } });
    expect(assignments.map(item => item.serviceId).sort()).toEqual([...winner.serviceIds].sort());
    expect(await db.auditLog.count({ where: { tenantId: tenantId('a'), resourceId: professional.id, action: 'professional.updated' } })).toBe(1);
    expectError(await write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional)), 409, 'CONFLICT');
  });

  it('rolls back creates, edits and assignments when PostgreSQL rejects the audit insert', async () => {
    const service = await createService();
    const professional = await createProfessional();
    const serviceBefore = await db.service.findUniqueOrThrow({ where: { id: service.id } });
    const professionalBefore = await db.professional.findUniqueOrThrow({ where: { id: professional.id } });
    const counts = [await db.service.count({ where: { tenantId: tenantId('a') } }), await db.professional.count({ where: { tenantId: tenantId('a') } }), await db.auditLog.count({ where: { tenantId: tenantId('a') } })];
    // Both SQL identifiers and the tenant value are generated locally, never supplied by a request.
    // The trigger rejects only this suite's tenant and is always removed before fixture cleanup.
    await db.$executeRawUnsafe(`CREATE FUNCTION "${auditFailureName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Catalog fixture audit failure'; END $$`);
    auditFailureFunction = true;
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER "${auditFailureName}" BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.tenant_id = '${tenantId('a')}') EXECUTE FUNCTION "${auditFailureName}"()`);
      auditFailureTrigger = true;
      expect((await write('POST', route('services'), serviceInput())).statusCode).toBe(500);
      expect((await write('POST', route('professionals'), professionalInput())).statusCode).toBe(500);
      expect((await write('PATCH', route('services', 'a', service.id), serviceUpdate(service, { name: 'Must roll back' }))).statusCode).toBe(500);
      expect((await write('PATCH', route('professionals', 'a', professional.id), professionalUpdate(professional, { name: 'Must roll back', serviceIds: [ids.inactiveService] }))).statusCode).toBe(500);
      expect(await db.service.findUnique({ where: { id: service.id } })).toEqual(serviceBefore);
      expect(await db.professional.findUnique({ where: { id: professional.id } })).toEqual(professionalBefore);
      expect(await db.professionalService.findMany({ where: { tenantId: tenantId('a'), professionalId: professional.id }, select: { serviceId: true } })).toEqual([{ serviceId: ids.service }]);
      expect([await db.service.count({ where: { tenantId: tenantId('a') } }), await db.professional.count({ where: { tenantId: tenantId('a') } }), await db.auditLog.count({ where: { tenantId: tenantId('a') } })]).toEqual(counts);
    } finally { await removeAuditFailure(); }
  });

  it('publishes only active services and professionals belonging to active units', async () => {
    const response = await get(`/v1/public/site?hostname=${tenantId('a')}.platform.test`, null);
    expect(response.statusCode, response.body).toBe(200);
    const site = response.json<{ data: { services: { id: string }[]; professionals: { id: string }[] } }>();
    expect(site.data.services.map(item => item.id)).toContain(ids.service);
    expect(site.data.professionals.map(item => item.id)).toContain(ids.professional);
    for (const id of [ids.inactiveService, ids.inactiveLocationService, ids.foreignService]) expect(site.data.services.map(item => item.id)).not.toContain(id);
    for (const id of [ids.inactiveProfessional, ids.inactiveLocationProfessional, ids.foreignProfessional]) expect(site.data.professionals.map(item => item.id)).not.toContain(id);
  });
});
