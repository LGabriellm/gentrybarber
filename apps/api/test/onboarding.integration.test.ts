import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { emailJobSchema, type EmailMessage, type NotificationProvider } from '@platform/notifications';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error('DATABASE_TEST_URL is required for the onboarding API integration suite.');
const target = new URL(databaseUrl);
if (!['postgresql:', 'postgres:'].includes(target.protocol) || !decodeURIComponent(target.pathname.slice(1)).endsWith('_test')) {
  throw new Error('Onboarding integration tests require a dedicated PostgreSQL database whose name ends in _test.');
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

const prefix = `onboarding-it-${randomBytes(8).toString('hex')}`;
const db = createDatabase(databaseUrl);
const email = new CapturedEmail();
const origin = 'http://localhost:3001';
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Onboarding integration', PLATFORM_DOMAIN: 'platform.test',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: origin,
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Integration <noreply@example.test>', TRUST_PROXY_CIDRS: '127.0.0.1/32',
});

const recipient = `${prefix}@example.test`;
const clientSubnet = [...randomBytes(2)].map(value => (value % 254) + 1).join('.');
const rateLimitScope = { key: { startsWith: `127.${clientSubnet}.` } };

describe('Onboarding API', () => {
  let session: string;
  let services: FoundationServices;
  let app: Awaited<ReturnType<typeof createApplication>>;
  let planId: string;
  let ownerRoleId: string;
  let previousDefault: Awaited<ReturnType<typeof db.systemSetting.findUnique>>;

  beforeAll(async () => {
    previousDefault = await db.systemSetting.findUnique({ where: { key: 'onboarding.defaults' } });
    const plan = await db.plan.upsert({ where: { key: 'start' }, create: { id: `${prefix}-start-plan`, key: 'start', name: 'Start', active: true }, update: {} });
    planId = plan.id;
    await db.systemSetting.upsert({ where: { key: 'onboarding.defaults' }, create: { key: 'onboarding.defaults', value: { planId }, description: 'Test default' }, update: { value: { planId } } });
    const role = await db.role.upsert({ where: { key: 'OWNER' }, create: { id: `${prefix}-owner-role`, key: 'OWNER', name: 'Owner' }, update: {} });
    ownerRoleId = role.id;
    
    const auth = createAuth(db, config, email);
    services = new FoundationServices(db, auth, config);
    app = await createApplication(config, services);
    
    // Create an authenticated user
    const creation = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { name: 'New User', email: recipient, password: 'StrongPassword123!', callbackURL: '/' }, headers: { origin } });
    if (creation.statusCode !== 200) throw new Error(`Sign-up failed: ${creation.body}`);
    const verification = email.verificationFor(recipient);
    await app.inject({ method: 'GET', url: `${verification.pathname}${verification.search}` });
    const login = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: recipient, password: 'StrongPassword123!', rememberMe: true }, headers: { origin, 'X-Forwarded-For': `127.${clientSubnet}.100.1` } });
    if (login.statusCode !== 200) throw new Error(`Sign-in failed: ${login.body}`);
    session = login.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await app.close();
    if (previousDefault) await db.systemSetting.update({ where: { key: 'onboarding.defaults' }, data: { value: previousDefault.value! } });
    else await db.systemSetting.deleteMany({ where: { key: 'onboarding.defaults' } });
    const owned = { tenant: { slug: { startsWith: prefix } } };
    await db.auditLog.deleteMany({ where: owned });
    await db.location.deleteMany({ where: owned });
    await db.tenant.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    // Delete the specific memberships and users we created (cannot delete the global 'start' and 'OWNER' easily without breaking other tests)
    // await db.role.delete({ where: { id: ownerRoleId } });
    // await db.plan.delete({ where: { id: planId } });
    await db.rateLimit.deleteMany({ where: rateLimitScope });
    await db.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/onboarding', payload: { tenantName: 'Barbearia X', tenantSlug: 'barbearia-x', locationName: 'Unidade 1' }, headers: { origin } });
    expect(response.statusCode).toBe(401);
  });

  it('rejects missing or untrusted origin', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/onboarding', payload: { tenantName: 'Barbearia X', tenantSlug: 'barbearia-x', locationName: 'Unidade 1' }, headers: { cookie: session } });
    expect(response.statusCode).toBe(403);
    const untrusted = await app.inject({ method: 'POST', url: '/v1/onboarding', payload: { tenantName: 'Barbearia X', tenantSlug: 'barbearia-x', locationName: 'Unidade 1' }, headers: { cookie: session, origin: 'https://evil.com' } });
    expect(untrusted.statusCode).toBe(403);
  });

  it('creates tenant, membership and location for a new user', async () => {
    const payload = { tenantName: 'Barbearia do Zé', tenantSlug: `${prefix}-barbearia-ze`, locationName: 'Unidade Central' };
    const response = await app.inject({ method: 'POST', url: '/v1/onboarding', payload, headers: { cookie: session, origin } });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty('tenantId');
    expect(body).toHaveProperty('locationId');
    expect(body.slug).toBe(payload.tenantSlug);

    // Verify DB
    const tenant = await db.tenant.findUnique({ where: { id: body.tenantId }, include: { memberships: true, locations: true } });
    expect(tenant?.name).toBe(payload.tenantName);
    expect(tenant?.planId).toBe(planId);
    expect(tenant?.memberships).toHaveLength(1);
    expect(tenant?.memberships[0]?.roleId).toBe(ownerRoleId);
    expect(tenant?.locations).toHaveLength(1);
    expect(tenant?.locations[0]?.name).toBe(payload.locationName);
  });

  it('serializes onboarding for the same user and rejects invalid fields', async () => {
    const user = await db.user.create({ data: { id: `${prefix}-concurrent`, name: 'Concurrent fictitious user', email: `${prefix}-concurrent@example.test`, emailVerified: true } });
    const input = { tenantName: 'Concurrent tenant', tenantSlug: `${prefix}-race-a`, locationName: 'Central' };
    await expect(services.onboarding.onboard(user.id, { ...input, timezone: 'Not/AZone' })).rejects.toThrow();
    await expect(services.onboarding.onboard(user.id, { ...input, planId: 'client-chosen-plan' })).rejects.toThrow();
    const results = await Promise.allSettled([services.onboarding.onboard(user.id, input), services.onboarding.onboard(user.id, { ...input, tenantSlug: `${prefix}-race-b` })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { actorUserId: user.id, action: 'tenant.onboarded' } })).toBe(1);
  });

  it('keeps global authority separate from tenant onboarding', async () => {
    const user = await db.user.create({ data: { id: `${prefix}-global-admin`, name: 'Global fictitious administrator', email: `${prefix}-global-admin@example.test`, emailVerified: true, platformRole: 'SUPER_ADMIN' } });
    await expect(services.onboarding.onboard(user.id, { tenantName: 'Tenant indevido', tenantSlug: `${prefix}-global-admin`, locationName: 'Central' })).rejects.toThrow('FORBIDDEN');
    expect(await db.tenant.count({ where: { slug: `${prefix}-global-admin` } })).toBe(0);
  });

  it('rejects duplicate slug', async () => {
    const payload = { tenantName: 'Outra Barbearia', tenantSlug: `${prefix}-barbearia-ze`, locationName: 'Unidade Central' };
    
    // Note: We need a different user to trigger this, because the current user now has an active membership
    const secondEmail = `${prefix}-2@example.test`;
    await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { name: 'User 2', email: secondEmail, password: 'StrongPassword123!', callbackURL: '/' }, headers: { origin } });
    const verification = email.verificationFor(secondEmail);
    await app.inject({ method: 'GET', url: `${verification.pathname}${verification.search}` });
    const login = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: secondEmail, password: 'StrongPassword123!', rememberMe: true }, headers: { origin, 'X-Forwarded-For': `127.${clientSubnet}.100.1` } });
    const session2 = login.headers['set-cookie'] as string;

    const response = await app.inject({ method: 'POST', url: '/v1/onboarding', payload, headers: { cookie: session2, origin } });
    expect(response.statusCode).toBe(409); // CONFLICT
    
    // Clean up second user
    await db.user.deleteMany({ where: { email: secondEmail } });
  });

  it('rejects if user already has an active membership', async () => {
    const payload = { tenantName: 'Barbearia Secundaria', tenantSlug: `${prefix}-barbearia-secundaria`, locationName: 'Unidade 2' };
    const response = await app.inject({ method: 'POST', url: '/v1/onboarding', payload, headers: { cookie: session, origin } });
    expect(response.statusCode).toBe(403); // FORBIDDEN, user already has active membership
  });

});

