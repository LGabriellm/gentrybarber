import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { emailJobSchema, type EmailMessage, type NotificationProvider } from '@platform/notifications';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error('DATABASE_TEST_URL is required for the real API integration suite.');
const databaseTarget = new URL(databaseUrl);
if (!['postgresql:', 'postgres:'].includes(databaseTarget.protocol) || !decodeURIComponent(databaseTarget.pathname.slice(1)).endsWith('_test')) {
  throw new Error('API integration tests require a dedicated PostgreSQL database whose name ends in _test.');
}

class CapturedEmailProvider implements NotificationProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(emailJobSchema.parse(message));
  }

  linkFor(recipient: string, path: string): URL {
    for (const message of this.messages.slice().reverse()) {
      if (message.to !== recipient) continue;
      const address = message.text.match(/https?:\/\/[^\s]+/)?.[0];
      if (address) {
        const url = new URL(address);
        if (url.pathname.includes(path)) return url;
      }
    }
    throw new Error('Expected a captured transactional e-mail for this test account.');
  }
}

const prefix = `api-it-${randomUUID()}`;
const db = createDatabase(databaseUrl);
const email = new CapturedEmailProvider();
const origin = 'http://localhost:3001';
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Foundation integration', PLATFORM_DOMAIN: 'platform.test',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: origin,
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Integration <noreply@example.test>',
});
const ids = {
  plan: `${prefix}-plan`, ownerRole: `${prefix}-owner`, limitedRole: `${prefix}-limited`,
  tenantA: `${prefix}-a`, tenantB: `${prefix}-b`, tenantLimited: `${prefix}-limited-tenant`,
  siteA: `${prefix}-site-a`, siteB: `${prefix}-site-b`, siteLimited: `${prefix}-site-limited`,
};
const slugs = { a: `${prefix}-a`, b: `${prefix}-b`, limited: `${prefix}-limited` };
const ownEmails: string[] = [];
const ownFeatureIds: string[] = [];
const ownPermissionIds: string[] = [];
const ownThemeIds: string[] = [];
const clientAddresses = new Map<string, string>();
const cookieAddresses = new Map<string, string>();
const clientSubnet = [...randomBytes(2)].map(value => (value % 254) + 1);
const defaultClientAddress = `127.${clientSubnet.join('.')}.1`;
const rateLimitScope = [1, 2, 3, 4, 240].map(last => ({ key: { startsWith: `127.${clientSubnet.join('.')}.${last}|` } }));
let previousRateLimitIds: string[] = [];
type Application = Awaited<ReturnType<typeof createApplication>>;
type ApiServer = ReturnType<ReturnType<Application['getHttpAdapter']>['getInstance']>;
let app: Application | undefined;
let server: ApiServer;
let primary: { userId: string; email: string; password: string; cookie: string };

function cookiesFrom(response: LightMyRequestResponse): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
  const sessionCookie = cookies.find(cookie => cookie.startsWith('better-auth.session_token='));
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie).toMatch(/; HttpOnly/i);
  expect(sessionCookie).toMatch(/; SameSite=Lax/i);
  return cookies.map(cookie => cookie.split(';')[0]).join('; ');
}

function post(path: string, body: Record<string, unknown>, cookie?: string) {
  const remoteAddress = (typeof body.email === 'string' ? clientAddresses.get(body.email) : undefined)
    ?? (cookie ? cookieAddresses.get(cookie) : undefined) ?? defaultClientAddress;
  return server.inject({
    method: 'POST', url: `/api/auth${path}`, payload: body, remoteAddress,
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

function get(path: string, cookie?: string) {
  return server.inject({ method: 'GET', url: path, remoteAddress: (cookie ? cookieAddresses.get(cookie) : undefined) ?? defaultClientAddress, headers: cookie ? { cookie } : {} });
}

async function registerVerifiedUser(label: string) {
  const recipient = `${prefix}-${label}@example.test`;
  const password = `Test-${randomBytes(24).toString('hex')}`;
  ownEmails.push(recipient);
  const clientAddress = `127.${clientSubnet.join('.')}.${ownEmails.length + 1}`;
  clientAddresses.set(recipient, clientAddress);
  const signup = await post('/sign-up/email', { email: recipient, password, name: `Integration ${label}` });
  expect(signup.statusCode).toBe(200);
  const signupBody = signup.json<{ user: { id: string; emailVerified: boolean }; token: string | null }>();
  expect(signupBody.user.emailVerified).toBe(false);
  expect(signupBody.token).toBeNull();

  if (label === 'member') {
    const unverifiedLogin = await post('/sign-in/email', { email: recipient, password });
    expect(unverifiedLogin.statusCode).toBe(403);
  }

  const verification = email.linkFor(recipient, '/verify-email');
  expect(verification.origin).toBe(config.BETTER_AUTH_URL);
  expect(verification.searchParams.get('token')).toBeTruthy();
  const verify = await get(`${verification.pathname}${verification.search}`);
  expect([200, 302]).toContain(verify.statusCode);
  expect(await db.user.findUnique({ where: { id: signupBody.user.id }, select: { emailVerified: true } })).toEqual({ emailVerified: true });

  const login = await post('/sign-in/email', { email: recipient, password });
  expect(login.statusCode).toBe(200);
  const cookie = cookiesFrom(login);
  cookieAddresses.set(cookie, clientAddress);
  return { userId: signupBody.user.id, email: recipient, password, cookie };
}

beforeAll(async () => {
  previousRateLimitIds = (await db.rateLimit.findMany({ where: { OR: rateLimitScope }, select: { id: true } })).map(record => record.id);
  await db.plan.create({ data: { id: ids.plan, key: ids.plan, name: 'Premium is only a label in this fixture' } });
  for (const key of ['website', 'custom_domain'] as const) {
    const id = `${prefix}-feature-${key}`;
    const feature = await db.feature.upsert({ where: { key }, create: { id, key, name: key }, update: {} });
    if (feature.id === id) ownFeatureIds.push(id);
    await db.planFeature.create({ data: { planId: ids.plan, featureId: feature.id, enabled: key === 'website' } });
  }
  await db.role.createMany({ data: [
    { id: ids.ownerRole, key: ids.ownerRole, name: 'Integration owner' },
    { id: ids.limitedRole, key: ids.limitedRole, name: 'Integration member without site permission' },
  ] });
  for (const key of ['website.manage', 'domains.manage'] as const) {
    const id = `${prefix}-permission-${key}`;
    const permission = await db.permission.upsert({ where: { key }, create: { id, key, description: key }, update: {} });
    if (permission.id === id) ownPermissionIds.push(id);
    await db.rolePermission.create({ data: { roleId: ids.ownerRole, permissionId: permission.id } });
  }
  await db.tenant.createMany({ data: [
    { id: ids.tenantA, slug: slugs.a, name: 'Integration tenant A', planId: ids.plan, status: 'ACTIVE' },
    { id: ids.tenantB, slug: slugs.b, name: 'Integration tenant B', planId: ids.plan, status: 'ACTIVE' },
    { id: ids.tenantLimited, slug: slugs.limited, name: 'Integration limited access', planId: ids.plan, status: 'ACTIVE' },
  ] });
  const themes = new Map<string, string>();
  for (const key of ['classic', 'urban']) {
    const id = `${prefix}-theme-${key}`;
    const theme = await db.theme.upsert({ where: { key }, create: { id, key, name: key, kind: 'TEMPLATE' }, update: {} });
    expect(theme.active).toBe(true);
    expect(theme.ownerTenantId).toBeNull();
    if (theme.id === id) ownThemeIds.push(id);
    themes.set(key, theme.id);
  }
  const sites = [
    { id: ids.siteA, tenantId: ids.tenantA, themeKey: 'classic' },
    { id: ids.siteB, tenantId: ids.tenantB, themeKey: 'urban' },
    { id: ids.siteLimited, tenantId: ids.tenantLimited, themeKey: 'classic' },
  ];
  for (const site of sites) {
    const themeId = themes.get(site.themeKey);
    if (!themeId) throw new Error('Missing fixture renderer mapping.');
    const version = await db.themeVersion.create({ data: {
      id: `${site.id}-v1`, tenantId: site.tenantId, themeId, version: 1,
      status: 'PUBLISHED', config: {}, publishedAt: new Date(),
    } });
    await db.siteConfiguration.create({ data: {
      id: site.id, tenantId: site.tenantId, themeId, publishedThemeVersionId: version.id,
      title: `Public ${site.id}`, description: 'Public integration fixture', published: true,
    } });
  }

  const auth = createAuth(db, config, email);
  app = await createApplication(config, new FoundationServices(db, auth, config));
  server = app.getHttpAdapter().getInstance();
  primary = await registerVerifiedUser('member');
  await db.membership.createMany({ data: [
    { tenantId: ids.tenantA, userId: primary.userId, roleId: ids.ownerRole, status: 'ACTIVE' },
    { tenantId: ids.tenantLimited, userId: primary.userId, roleId: ids.limitedRole, status: 'ACTIVE' },
  ] });
}, 60_000);

afterAll(async () => {
  try {
    await app?.close();
    const users = await db.user.findMany({ where: { email: { in: ownEmails } }, select: { id: true } });
    const userIds = users.map(user => user.id);
    const tenantIds = [ids.tenantA, ids.tenantB, ids.tenantLimited];
    await db.$transaction([
      db.rateLimit.deleteMany({ where: { OR: rateLimitScope, id: { notIn: previousRateLimitIds } } }),
      db.verification.deleteMany({ where: { OR: [{ value: { in: userIds } }, { identifier: { in: ownEmails } }] } }),
      db.siteConfiguration.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.themeVersion.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      db.user.deleteMany({ where: { id: { in: userIds } } }),
      db.role.deleteMany({ where: { id: { in: [ids.ownerRole, ids.limitedRole] } } }),
      db.plan.deleteMany({ where: { id: ids.plan } }),
      db.theme.deleteMany({ where: { id: { in: ownThemeIds } } }),
      db.permission.deleteMany({ where: { id: { in: ownPermissionIds } } }),
      db.feature.deleteMany({ where: { id: { in: ownFeatureIds } } }),
    ]);
  } finally {
    await db.$disconnect();
  }
}, 30_000);

describe('Foundation API with PostgreSQL and Better Auth', () => {
  it('requires a real verified session for private routes', async () => {
    expect((await get('/v1/me')).statusCode).toBe(401);
    expect((await get(`/v1/tenants/${slugs.a}/context`)).statusCode).toBe(401);
    expect((await get('/v1/me', 'better-auth.session_token=forged')).statusCode).toBe(401);
  });

  it('signs up, verifies the captured e-mail, signs in and revokes the session on logout', async () => {
    const user = await registerVerifiedUser('logout');
    const me = await get('/v1/me', user.cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json<{ user: { id: string } }>().user.id).toBe(user.userId);
    expect((await post('/sign-out', {}, user.cookie)).statusCode).toBe(200);
    expect((await get('/v1/me', user.cookie)).statusCode).toBe(401);
  });

  it('returns only active memberships belonging to the signed-in user', async () => {
    const response = await get('/v1/me', primary.cookie);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ user: { platformRole: string }; memberships: { tenant: { id: string } }[] }>();
    expect(body.user.platformRole).toBe('USER');
    expect(body.memberships.map(membership => membership.tenant.id).sort()).toEqual([ids.tenantA, ids.tenantLimited].sort());
  });

  it('does not reveal a foreign tenant through its slug', async () => {
    const foreign = await get(`/v1/tenants/${slugs.b}/context`, primary.cookie);
    const missing = await get(`/v1/tenants/${prefix}-missing/context`, primary.cookie);
    expect(foreign.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
  });

  it('scopes resource IDs to the authorized tenant and prevents site IDOR', async () => {
    const own = await get(`/v1/tenants/${slugs.a}/sites/${ids.siteA}`, primary.cookie);
    expect(own.statusCode).toBe(200);
    expect(own.json<{ id: string }>().id).toBe(ids.siteA);
    const foreign = await get(`/v1/tenants/${slugs.a}/sites/${ids.siteB}`, primary.cookie);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'NOT_FOUND' });
  });

  it('requires the site permission even when the tenant has the website feature', async () => {
    const response = await get(`/v1/tenants/${slugs.limited}/site`, primary.cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'FORBIDDEN' });
  });

  it('requires a custom_domain grant even for a role with domains.manage and a Premium-labelled plan', async () => {
    const response = await get(`/v1/tenants/${slugs.a}/domains`, primary.cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'FEATURE_DISABLED' });
  });

  it('requires global platform authority for the administrative tenant list', async () => {
    const response = await get('/v1/admin/tenants', primary.cookie);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'FORBIDDEN' });
  });

  it('rate-limits the trusted client address despite forged internal IP headers', async () => {
    const remoteAddress = `127.${clientSubnet.join('.')}.240`;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await server.inject({
        method: 'POST', url: '/api/auth/sign-in/email', remoteAddress,
        payload: { email: primary.email, password: `Invalid-${randomUUID()}` },
        headers: { origin, 'content-type': 'application/json', 'x-platform-client-ip': `198.51.100.${attempt + 1}` },
      });
      expect(response.statusCode).toBe(attempt < 3 ? 401 : 429);
    }
  });

  it('resolves each public tenant to its published renderer and excludes private membership data', async () => {
    for (const [slug, tenantId, expectedTheme] of [[slugs.a, ids.tenantA, 'classic'], [slugs.b, ids.tenantB, 'urban']]) {
      const response = await get(`/v1/public/site?hostname=${slug}.platform.test`);
      expect(response.statusCode).toBe(200);
      const body = response.json<{ themeId: string; version: number; data: { tenant: { id: string }; memberships?: unknown } }>();
      expect(body.themeId).toBe(expectedTheme);
      expect(body.version).toBe(1);
      expect(body.data.tenant.id).toBe(tenantId);
      expect(body.data).not.toHaveProperty('memberships');
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('returns 404 for unknown or reserved public hostnames', async () => {
    for (const hostname of [`${prefix}-unknown.platform.test`, 'admin.platform.test']) {
      const response = await get(`/v1/public/site?hostname=${hostname}`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'NOT_FOUND' });
    }
  });

  it('authorizes TLS only for active platform tenants with a published site', async () => {
    expect((await get(`/internal/tls/authorize?domain=${slugs.a}.platform.test`)).statusCode).toBe(200);
    for (const hostname of [`${prefix}-unknown.platform.test`, 'admin.platform.test', 'customer.example.test']) {
      const response = await get(`/internal/tls/authorize?domain=${hostname}`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'NOT_FOUND' });
    }
  });

  it('resets a password through the captured link and revokes old sessions', async () => {
    const user = await registerVerifiedUser('reset');
    const request = await post('/request-password-reset', { email: user.email, redirectTo: `${origin}/reset-password` });
    expect(request.statusCode).toBe(200);
    const link = email.linkFor(user.email, '/reset-password/');
    const callback = await get(`${link.pathname}${link.search}`);
    expect(callback.statusCode).toBe(302);
    const location = callback.headers.location;
    if (typeof location !== 'string') throw new Error('Missing password-reset callback redirect.');
    const redirect = new URL(location);
    expect(redirect.origin).toBe(origin);
    const token = redirect.searchParams.get('token');
    expect(token).toBeTruthy();
    const newPassword = `Reset-${randomBytes(24).toString('hex')}`;
    expect((await post('/reset-password', { token, newPassword })).statusCode).toBe(200);
    expect((await get('/v1/me', user.cookie)).statusCode).toBe(401);
    expect((await post('/sign-in/email', { email: user.email, password: user.password })).statusCode).toBe(401);
    const login = await post('/sign-in/email', { email: user.email, password: newPassword });
    expect(login.statusCode).toBe(200);
    expect((await get('/v1/me', cookiesFrom(login))).statusCode).toBe(200);
    expect((await post('/reset-password', { token, newPassword })).statusCode).toBe(400);
  });
});
