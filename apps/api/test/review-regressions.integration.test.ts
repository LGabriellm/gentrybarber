import { randomUUID, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, test, expect } from 'vitest';
import { bookingDb as db, bookingTenant, bookingPrefix, bookingGet, bookingWrite, setupBookingTests, cleanupBookingTests, operator, createBookingFixture } from './booking-fixtures';
import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
const ownFeatures: string[] = []; const ownUsers: string[] = []; const ownPlans: string[] = []; let themeId: string; let ownedTheme = false; let ownPermission: string | undefined;
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: process.env.DATABASE_TEST_URL, PLATFORM_DOMAIN: 'platform.test', BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: 'http://localhost:3001', REDIS_URL: 'redis://localhost:6379' });
const messages: { text: string }[] = [];
const auth = createAuth(db, config, { async send(message) { messages.push(message); } });

beforeAll(async () => {
  await setupBookingTests(); await db.user.update({ where: { id: operator.id }, data: { platformRole: 'SUPER_ADMIN' } });
  const permission = await db.permission.upsert({ where: { key: 'website.manage' }, create: { id: `${bookingPrefix}-website-permission`, key: 'website.manage', description: 'Website regression permission' }, update: {} });
  if (permission.id === `${bookingPrefix}-website-permission`) ownPermission = permission.id;
  const membership = await db.membership.findFirstOrThrow({ where: { userId: operator.id, tenantId: bookingTenant() } });
  await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: membership.roleId, permissionId: permission.id } }, create: { roleId: membership.roleId, permissionId: permission.id }, update: {} });
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: bookingTenant() } });
  for (const key of ['website', 'whatsapp_automation']) { const id = `${bookingPrefix}-${key}`; const f = await db.feature.upsert({ where: { key }, create: { id, key, name: key }, update: {} }); if (f.id === id) ownFeatures.push(id); await db.planFeature.create({ data: { planId: tenant.planId, featureId: f.id, enabled: true } }); }
  const theme = await db.theme.upsert({ where: { key: 'classic' }, create: { id: `${bookingPrefix}-classic`, key: 'classic', name: 'Classic', kind: 'TEMPLATE' }, update: {} }); themeId = theme.id; ownedTheme = theme.id === `${bookingPrefix}-classic`;
  const version = await db.themeVersion.create({ data: { tenantId: tenant.id, themeId, version: 1, status: 'PUBLISHED', config: { tokens: { primaryColor: '#123456' } } } });
  await db.siteConfiguration.create({ data: { tenantId: tenant.id, themeId, published: true, publishedThemeVersionId: version.id, title: 'Review fixture', description: '' } });
});
afterAll(async () => {
  await db.verification.deleteMany({ where: { identifier: { startsWith: `token:${bookingPrefix}` } } });
  await db.notification.deleteMany({ where: { tenantId: { startsWith: bookingPrefix } } });
  await db.siteConfiguration.deleteMany({ where: { tenantId: { startsWith: bookingPrefix } } });
  await db.themeVersion.deleteMany({ where: { tenantId: { startsWith: bookingPrefix } } });
  await db.auditLog.deleteMany({ where: { actorUserId: operator.id, tenantId: null } });
  await db.verification.deleteMany({ where: { value: { in: ownUsers } } });
  await db.user.deleteMany({ where: { id: { in: ownUsers } } });
  await db.plan.deleteMany({ where: { id: { in: ownPlans } } });
  await cleanupBookingTests();
  if (ownPermission) await db.permission.delete({ where: { id: ownPermission } });
  if (ownedTheme) await db.theme.delete({ where: { id: themeId } });
  await db.feature.deleteMany({ where: { id: { in: ownFeatures } } });
  await db.$disconnect();
});
test('rejects admin writes without Origin', async () => {
  const user = await bookingWrite('POST', '/v1/admin/users', { name: 'Review User', email: `${bookingPrefix}-blocked@example.test`, role: 'USER' }, { origin: null });
  const plan = await bookingWrite('POST', '/v1/admin/plans', { key: `${bookingPrefix}-blocked`, name: 'Review Plan', monthlyPriceCents: 1000, setupFeeCents: 0, customDesignFeeCents: 0 }, { origin: null });
  expect([user.statusCode, plan.statusCode]).toEqual([403, 403]);
});
test('keeps a plan without entitlements unavailable', async () => {
  const response = await bookingWrite('POST', '/v1/admin/plans', { key: `${bookingPrefix}-plan-new`, name: 'Review Plan', monthlyPriceCents: 1000, setupFeeCents: 0, customDesignFeeCents: 0 });
  expect(response.statusCode, response.body).toBe(201); ownPlans.push(response.json().id);
  expect(await db.planFeature.count({ where: { planId: response.json().id } })).toBe(0);
  expect((await db.plan.findUniqueOrThrow({ where: { id: response.json().id } })).active).toBe(false);
});
test('activates an admin-created account only after password reset and email verification', async () => {
  const email = `${bookingPrefix}-new@example.test`;
  const response = await bookingWrite('POST', '/v1/admin/users', { name: 'Review User', email, role: 'USER' });
  expect(response.statusCode, response.body).toBe(201); ownUsers.push(response.json().id);
  await auth.api.requestPasswordReset({ body: { email, redirectTo: 'http://localhost:3001/reset-password' } });
  const verification = await db.verification.findFirstOrThrow({ where: { value: response.json().id, identifier: { startsWith: 'reset-password:' } } });
  const password = `Review-${randomBytes(24).toString('hex')}`;
  await auth.api.resetPassword({ body: { token: verification.identifier.slice('reset-password:'.length), newPassword: password } });
  const login = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(login.status).toBe(403); expect((await login.json()).code).toBe('EMAIL_NOT_VERIFIED');
  expect(messages).toHaveLength(2);
  const verificationUrl = new URL(messages[1]!.text.match(/https?:\/\/[^\s]+/)![0]);
  const verified = await auth.api.verifyEmail({ query: { token: verificationUrl.searchParams.get('token')!, callbackURL: 'http://localhost:3001/login' }, asResponse: true });
  expect([200, 302]).toContain(verified.status);
  expect((await db.user.findUniqueOrThrow({ where: { id: response.json().id } })).emailVerified).toBe(true);
  expect((await auth.api.signInEmail({ body: { email, password }, asResponse: true })).status).toBe(200);
});
test('retires legacy appearance writes without changing the published version', async () => {
  const before = await db.themeVersion.findFirstOrThrow({ where: { tenantId: bookingTenant() } });
  const response = await bookingWrite('PATCH', `/v1/tenants/${bookingTenant()}/design`, { primaryColor: '#abcdef' });
  expect(response.statusCode, response.body).toBe(410);
  expect(response.json().error).toBe('EDITOR_MOVED');
  expect(await db.tenantDesignConfig.count({ where: { tenantId: bookingTenant() } })).toBe(0);
  expect(await db.themeVersion.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
});
test('preserves revoked consent on an anonymous booking and never enqueues WhatsApp', async () => {
  const fixture = await createBookingFixture(); const customer = await db.customer.findUniqueOrThrow({ where: { id: fixture.customerId } });
  const response = await bookingWrite('POST', '/v1/public/booking/appointments', { hostname: `${bookingTenant()}.platform.test`, locationId: fixture.locationId, professionalId: fixture.professionalId, serviceIds: [fixture.serviceId], startsAt: fixture.at(10), idempotencyKey: randomUUID(), customer: { name: 'Unverified input', phone: customer.phone, email: null, notes: null, whatsappOptIn: true } }, { session: null });
  expect(response.statusCode, response.body).toBe(201);
  const after = await db.customer.findUniqueOrThrow({ where: { id: fixture.customerId } }); expect(after.whatsappOptInAt).toBeNull(); expect(after.version).toBe(customer.version);
  expect(await db.auditLog.count({ where: { tenantId: fixture.tenantId, action: 'customer.whatsapp_opted_in', resourceId: customer.id } })).toBe(0);
  expect(await db.notification.count({ where: { tenantId: fixture.tenantId, appointmentId: response.json().id } })).toBe(0);
});
test('searches and paginates all customers without crossing tenants', async () => {
  const tenantId = bookingTenant('b');
  await db.customer.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ tenantId, name: `Review Customer ${String(i).padStart(3,'0')}`, phone: `+551190${String(i).padStart(6,'0')}` })) });
  const first = await bookingGet(`/v1/tenants/${tenantId}/customers`); expect(first.statusCode).toBe(200); expect(first.json().items).toHaveLength(50);
  expect(first.json().items.some((item: { name: string }) => item.name.endsWith('050'))).toBe(false);
  expect(first.json()).toMatchObject({ page: 1, hasMore: true });
  const second = await bookingGet(`/v1/tenants/${tenantId}/customers?page=2`);
  expect(second.json()).toMatchObject({ page: 2, hasMore: false }); expect(second.json().items).toHaveLength(1);
  expect(second.json().items[0].name).toBe('Review Customer 050');
  expect((await bookingGet(`/v1/tenants/${tenantId}/customers?page=0`)).statusCode).toBe(400);
  const found = await bookingGet(`/v1/tenants/${tenantId}/customers?q=050`); expect(found.json().items).toHaveLength(1);
});
test('copies configured features and limits atomically, and rejects invalid base plans', async () => {
  const basePlanId = (await db.tenant.findUniqueOrThrow({ where: { id: bookingTenant() } })).planId;
  const input = { key: `${bookingPrefix}-copied`, name: 'Copied plan', monthlyPriceCents: 1000, setupFeeCents: 0, customDesignFeeCents: 0, basePlanId };
  const response = await bookingWrite('POST', '/v1/admin/plans', input);
  expect(response.statusCode, response.body).toBe(201); ownPlans.push(response.json().id);
  expect((await db.plan.findUniqueOrThrow({ where: { id: response.json().id } })).active).toBe(true);
  const fields = { featureId: true, enabled: true, limit: true } as const;
  expect(await db.planFeature.findMany({ where: { planId: response.json().id }, select: fields, orderBy: { featureId: 'asc' } })).toEqual(await db.planFeature.findMany({ where: { planId: basePlanId }, select: fields, orderBy: { featureId: 'asc' } }));
  for (const invalid of ['missing-plan', ownPlans[0]!]) {
    expect((await bookingWrite('POST', '/v1/admin/plans', { ...input, key: `${bookingPrefix}-invalid`, basePlanId: invalid })).statusCode).toBe(400);
  }
  expect(await db.plan.count({ where: { key: `${bookingPrefix}-invalid` } })).toBe(0);
});
