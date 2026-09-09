import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { emailJobSchema, type EmailMessage, type NotificationProvider } from '@platform/notifications';
import type { LocationCatalog } from '@platform/types';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error('DATABASE_TEST_URL is required for the locations API integration suite.');
const target = new URL(databaseUrl);
if (!['postgresql:', 'postgres:'].includes(target.protocol) || !decodeURIComponent(target.pathname.slice(1)).endsWith('_test')) {
  throw new Error('Locations integration tests require a dedicated PostgreSQL database whose name ends in _test.');
}

class CapturedEmail implements NotificationProvider {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(emailJobSchema.parse(message)); }
  verificationFor(recipient: string) {
    const message = this.messages.find(item => item.to === recipient);
    const address = message?.text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!address) throw new Error('Missing verification message for the fictitious account.');
    return new URL(address);
  }
}

const prefix = `locations-it-${randomBytes(8).toString('hex')}`;
const db = createDatabase(databaseUrl);
const email = new CapturedEmail();
const origin = 'http://localhost:3001';
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Locations integration', PLATFORM_DOMAIN: 'platform.test',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: origin,
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Integration <noreply@example.test>', TRUST_PROXY_CIDRS: '127.0.0.1/32',
});

const tenantId = `${prefix}-tenant`;
const slug = `${prefix}-slug`;
const planId = `${prefix}-plan`;
const ownerRole = `${prefix}-owner`;
const recipient = `${prefix}@example.test`;
const clientSubnet = [...randomBytes(2)].map(value => (value % 254) + 1).join('.');
const rateLimitScope = { key: { startsWith: `127.${clientSubnet}.` } };

describe('Locations API', () => {
  let session: string;
  let services: FoundationServices;
  let app: Awaited<ReturnType<typeof createApplication>>;

  beforeAll(async () => {
    await db.plan.create({ data: { id: planId, key: `${prefix}-start`, name: 'Start', active: true } });
    await db.role.create({ data: { id: ownerRole, key: `${prefix}-OWNER`, name: 'Owner' } });
    const permission = await db.permission.upsert({ where: { key: 'team.manage' }, create: { id: `${prefix}-perm-team`, key: 'team.manage', description: 'Manage Team' }, update: {} });
    await db.rolePermission.create({ data: { roleId: ownerRole, permissionId: permission.id } });
    await db.tenant.create({ data: { id: tenantId, name: 'Locations Test', slug, planId, status: 'ACTIVE' } });
    const feature = await db.feature.upsert({ where: { key: 'multi_location' }, create: { id: `${prefix}-multi-loc`, key: 'multi_location', name: 'Multi Location' }, update: {} });
    await db.planFeature.create({ data: { planId, featureId: feature.id, enabled: true } });

    const auth = createAuth(db, config, email);
    services = new FoundationServices(db, auth, config);
    app = await createApplication(config, services);
    
    // Create an authenticated user
    const creation = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { name: 'Locations User', email: recipient, password: 'StrongPassword123!', callbackURL: '/' }, headers: { origin } });
    if (creation.statusCode !== 200) throw new Error(`Sign-up failed: ${creation.body}`);
    const verification = email.verificationFor(recipient);
    await app.inject({ method: 'GET', url: `${verification.pathname}${verification.search}` });
    const login = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: recipient, password: 'StrongPassword123!', rememberMe: true }, headers: { origin, 'X-Forwarded-For': `127.${clientSubnet}.100.1` } });
    if (login.statusCode !== 200) throw new Error(`Sign-in failed: ${login.body}`);
    session = login.headers['set-cookie'] as string;

    const user = await db.user.findUnique({ where: { email: recipient } });
    await db.membership.create({ data: { tenantId, userId: user!.id, roleId: ownerRole, status: 'ACTIVE' } });
  });

  afterAll(async () => {
    await app.close();
    await db.auditLog.deleteMany({ where: { tenantId } });
    await db.membership.deleteMany({ where: { tenantId } });
    await db.location.deleteMany({ where: { tenantId } });
    await db.user.deleteMany({ where: { email: recipient } });
    await db.role.delete({ where: { id: ownerRole } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.plan.delete({ where: { id: planId } });
    await db.rateLimit.deleteMany({ where: rateLimitScope });
    await db.$disconnect();
  });

  it('allows team.manage to create a location', async () => {
    const payload = { name: 'Main Location', address: { city: 'São Paulo', state: 'SP' }, active: true };
    const response = await app.inject({ method: 'POST', url: `/v1/tenants/${slug}/locations`, payload, headers: { cookie: session, origin } });
    if (response.statusCode !== 201) console.log(response.json());
    expect(response.statusCode).toBe(201);
    
    const body = response.json();
    expect(body.name).toBe('Main Location');
    expect(body.slug).toBe('main-location'); // auto generated
    expect(body.version).toBe(1);
    expect(body.active).toBe(true);
  });

  it('rejects duplicate location slug', async () => {
    const payload = { name: 'Main Location', slug: 'main-location', address: {}, active: true };
    const response = await app.inject({ method: 'POST', url: `/v1/tenants/${slug}/locations`, payload, headers: { cookie: session, origin } });
    expect(response.statusCode).toBe(409); // CONFLICT
  });

  it('lists locations', async () => {
    const response = await app.inject({ method: 'GET', url: `/v1/tenants/${slug}/locations`, headers: { cookie: session, origin } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as LocationCatalog;
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0]?.name).toBe('Main Location');
  });

  it('updates a location using optimistic concurrency', async () => {
    const listRes = await app.inject({ method: 'GET', url: `/v1/tenants/${slug}/locations`, headers: { cookie: session, origin } });
    const loc = listRes.json().locations[0];

    const payload = { name: 'Updated Location', address: { city: 'Rio de Janeiro' }, active: true, expectedVersion: loc.version };
    const response = await app.inject({ method: 'PATCH', url: `/v1/tenants/${slug}/locations/${loc.id}`, payload, headers: { cookie: session, origin } });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.name).toBe('Updated Location');
    expect(body.version).toBe(loc.version + 1);

    // Try updating with old version
    const failRes = await app.inject({ method: 'PATCH', url: `/v1/tenants/${slug}/locations/${loc.id}`, payload, headers: { cookie: session, origin } });
    expect(failRes.statusCode).toBe(409); // CONFLICT
  });

  it('allows only one concurrent update with the same version', async () => {
    const loc = (await app.inject({ method: 'GET', url: `/v1/tenants/${slug}/locations`, headers: { cookie: session } })).json().locations[0];
    const responses = await Promise.all(['First update', 'Second update'].map(name => app.inject({ method: 'PATCH', url: `/v1/tenants/${slug}/locations/${loc.id}`, payload: { name, active: true, address: {}, expectedVersion: loc.version }, headers: { cookie: session, origin } })));
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409]);
  });

  it('enforces the configured active-unit limit inside concurrent creation', async () => {
    await db.planFeature.updateMany({ where: { planId, feature: { key: 'multi_location' } }, data: { limit: 2 } });
    const responses = await Promise.all(['Second unit', 'Third unit'].map(name => app.inject({ method: 'POST', url: `/v1/tenants/${slug}/locations`, payload: { name, active: true, address: {} }, headers: { cookie: session, origin } })));
    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 403]);
    expect(await db.location.count({ where: { tenantId, active: true } })).toBe(2);
  });

  it('rejects unexpected nested input and query parameters', async () => {
    const response = await app.inject({ method: 'POST', url: `/v1/tenants/${slug}/locations`, payload: { name: 'Invalid unit', active: false, address: { secret: true } }, headers: { cookie: session, origin } });
    expect(response.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/v1/tenants/${slug}/locations?tenantId=foreign`, headers: { cookie: session } })).statusCode).toBe(400);
  });

  it('refuses to deactivate a unit with a future appointment', async () => {
    const location = await db.location.findFirstOrThrow({ where: { tenantId, active: true } });
    const customer = await db.customer.create({ data: { tenantId, name: 'Fictitious unit customer', phone: '+5511333333333' } });
    const professional = await db.professional.create({ data: { tenantId, locationId: location.id, name: 'Fictitious unit professional' } });
    const appointment = await db.appointment.create({ data: { tenantId, locationId: location.id, professionalId: professional.id, customerId: customer.id, status: 'CONFIRMED', startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 88200000), totalCents: 1000 } });
    try {
      const response = await app.inject({ method: 'PATCH', url: `/v1/tenants/${slug}/locations/${location.id}`, payload: { name: location.name, active: false, address: {}, expectedVersion: location.version }, headers: { cookie: session, origin } });
      expect(response.statusCode).toBe(409);
      expect((await db.location.findUniqueOrThrow({ where: { id: location.id } })).active).toBe(true);
    } finally {
      await db.appointment.delete({ where: { id: appointment.id } });
      await db.professional.delete({ where: { id: professional.id } });
      await db.customer.delete({ where: { id: customer.id } });
    }
  });
});

