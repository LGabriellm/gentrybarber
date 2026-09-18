import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { emailJobSchema, type EmailMessage, type NotificationProvider } from '@platform/notifications';

class CapturedEmail implements NotificationProvider {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(emailJobSchema.parse(message)); }
}

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error('DATABASE_TEST_URL is required for the API integration suite.');
const target = new URL(databaseUrl);
if (!['postgresql:', 'postgres:'].includes(target.protocol) || !decodeURIComponent(target.pathname.slice(1)).endsWith('_test')) {
  throw new Error('Integration tests require a dedicated PostgreSQL database whose name ends in _test.');
}

const prefix = `public-booking-it-${randomBytes(8).toString('hex')}`;
const db = createDatabase(databaseUrl);
const origin = 'http://localhost';
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Integration test', PLATFORM_DOMAIN: 'localhost',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: origin,
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Integration <noreply@example.test>', TRUST_PROXY_CIDRS: '127.0.0.1/32',
});

describe('Public Booking API', () => {
  let app: NestFastifyApplication;
  let tenantId: string;
  let locationId: string;
  let professionalId: string;
  let serviceId: string;
  let hostname: string;
  let services: FoundationServices;

  beforeAll(async () => {
    const email = new CapturedEmail();
    const auth = createAuth(db, config, email);
    services = new FoundationServices(db, auth, config);
    app = await createApplication(config, services);
    
    tenantId = `${prefix}-tenant`;
    hostname = `test-${prefix}.localhost`;

    const planId = `${prefix}-plan`;
    await db.plan.create({ data: { id: planId, key: `${prefix}-start`, name: 'start', active: true } });
    
    const ownerRole = `${prefix}-owner`;
    await db.role.create({ data: { id: ownerRole, key: `${prefix}-OWNER`, name: 'OWNER' } });
    const permission1 = await db.permission.upsert({ where: { key: 'appointments.manage_all' }, create: { id: `${prefix}-perm1`, key: 'appointments.manage_all', description: 'desc' }, update: {} });
    const permission2 = await db.permission.upsert({ where: { key: 'appointments.read' }, create: { id: `${prefix}-perm2`, key: 'appointments.read', description: 'desc' }, update: {} });
    const permission3 = await db.permission.upsert({ where: { key: 'appointments.create' }, create: { id: `${prefix}-perm3`, key: 'appointments.create', description: 'desc' }, update: {} });
    await db.rolePermission.createMany({ data: [{ roleId: ownerRole, permissionId: permission1.id }, { roleId: ownerRole, permissionId: permission2.id }, { roleId: ownerRole, permissionId: permission3.id }] });
    
    await db.tenant.create({ data: { id: tenantId, slug: `test-${prefix}`, name: 'Test Tenant', status: 'ACTIVE', planId } });
    
    const feat1 = await db.feature.upsert({ where: { key: 'booking' }, create: { id: `${prefix}-feat1`, key: 'booking', name: 'booking' }, update: {} });
    const feat2 = await db.feature.upsert({ where: { key: 'multi_location' }, create: { id: `${prefix}-feat2`, key: 'multi_location', name: 'multi_location' }, update: {} });
    const feat3 = await db.feature.upsert({ where: { key: 'website' }, create: { id: `${prefix}-feat3`, key: 'website', name: 'website' }, update: {} });
    await db.planFeature.createMany({ data: [{ planId, featureId: feat1.id, enabled: true }, { planId, featureId: feat2.id, enabled: true }, { planId, featureId: feat3.id, enabled: true }] });

    
    // Create custom domain for the tenant to match the hostname
    await db.domain.create({ data: { tenantId, hostname, status: 'ACTIVE', isPrimary: true } });

    locationId = `${prefix}-loc`;
    await db.location.create({ data: { tenantId, id: locationId, name: 'Main', active: true, timezone: 'UTC', slug: 'main' } });

    professionalId = `${prefix}-prof`;
    await db.professional.create({ data: { tenantId, locationId, id: professionalId, name: 'John', active: true } });

    serviceId = `${prefix}-svc`;
    await db.service.create({ data: { tenantId, locationId, id: serviceId, name: 'Haircut', durationMinutes: 30, priceCents: 5000, active: true } });

    await db.professionalService.create({ data: { tenantId, locationId, professionalId, serviceId } });

    // Ensure site config exists for website feature to work
    const theme = await db.theme.create({ data: { key: `theme_${prefix}`, name: 'Test Theme', ownerTenantId: tenantId, active: true, kind: 'BESPOKE' } });
    const themeVersion = await db.themeVersion.create({ data: { themeId: theme.id, tenantId, version: 1, status: 'PUBLISHED', config: { tokens: {} } } });
    await db.siteConfiguration.create({ data: { tenantId, title: 'Test Site', description: 'Test', published: true, themeId: theme.id, publishedThemeVersionId: themeVersion.id } });
    
    // Set schedule
    await db.businessHour.create({ data: { tenantId, locationId, weekday: 1, startMinute: 600, endMinute: 1200 } });
    await db.professionalSchedule.create({ data: { tenantId, locationId, professionalId, weekday: 1, startMinute: 600, endMinute: 1200 } });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await db.auditLog.deleteMany({ where: { tenantId } });
    await db.appointmentEvent.deleteMany({ where: { tenantId } });
    await db.appointmentService.deleteMany({ where: { tenantId } });
    await db.appointment.deleteMany({ where: { tenantId } });
    await db.customer.deleteMany({ where: { tenantId } });
    await db.businessHour.deleteMany({ where: { tenantId } });
    await db.professionalSchedule.deleteMany({ where: { tenantId } });
    await db.professionalService.deleteMany({ where: { tenantId } });
    await db.professional.deleteMany({ where: { tenantId } });
    await db.service.deleteMany({ where: { tenantId } });
    await db.location.deleteMany({ where: { tenantId } });
    await db.siteConfiguration.deleteMany({ where: { tenantId } });
    await db.themeVersion.deleteMany({ where: { tenantId } });
    await db.theme.deleteMany({ where: { ownerTenantId: tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.role.deleteMany({ where: { id: `${prefix}-owner` } });
    await db.plan.deleteMany({ where: { id: `${prefix}-plan` } });
    await db.verification.deleteMany({ where: { identifier: { startsWith: `token:${tenantId}:` } } });
    await db.$disconnect();
  });

  test('returns only active public booking choices and enforces publication and entitlement', async () => {
    const url = `/v1/public/booking/options?hostname=${hostname}`;
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ locations: [{ id: locationId, name: 'Main', timezone: 'UTC' }], services: [{ id: serviceId, locationId, name: 'Haircut', priceCents: 5000, durationMinutes: 30 }], professionals: [{ id: professionalId, locationId, name: 'John', serviceIds: [serviceId] }] });
    expect((await app.inject({ method: 'GET', url: `${url}&tenantId=foreign` })).statusCode).toBe(400);
    await db.service.update({ where: { id: serviceId }, data: { active: false } });
    expect((await app.inject({ method: 'GET', url })).json()).toMatchObject({ services: [], professionals: [{ serviceIds: [] }] });
    await db.service.update({ where: { id: serviceId }, data: { active: true } });
    await db.siteConfiguration.updateMany({ where: { tenantId }, data: { published: false } });
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    await db.siteConfiguration.updateMany({ where: { tenantId }, data: { published: true } });
    await db.planFeature.updateMany({ where: { planId: `${prefix}-plan`, feature: { key: 'booking' } }, data: { enabled: false } });
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403);
    await db.planFeature.updateMany({ where: { planId: `${prefix}-plan`, feature: { key: 'booking' } }, data: { enabled: true } });
  });

  test('fetch availability anonymously using hostname', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((1 + 7 - nextMonday.getUTCDay()) % 7 || 7));
    const date = nextMonday.toISOString().split('T')[0];

    const response = await app.inject({
      method: 'GET',
      url: `/v1/public/booking/availability?hostname=${hostname}&locationId=${locationId}&professionalId=${professionalId}&serviceIds=${serviceId}&date=${date}`,
      headers: { Origin: 'http://localhost' },
    });
    
    if (response.statusCode !== 200) {
      console.log('GET /availability failed:', response.json());
    }
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.slots).toBeDefined();
    expect(Array.isArray(body.slots)).toBe(true);
  });

  test('removed phone verification endpoints are unavailable', async () => {
    for (const path of ['verification-send', 'verification-check']) {
      const response = await app.inject({ method: 'POST', url: `/v1/public/booking/${path}`, payload: { hostname, phone: '+5511999999988' } });
      expect(response.statusCode).toBe(404);
    }
  });

  test('create public appointment anonymously', async () => {
    const nextMonday = new Date();
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((1 + 7 - nextMonday.getUTCDay()) % 7 || 7));
    nextMonday.setUTCHours(10, 0, 0, 0);

    const idempotencyKey = randomUUID();
    const customerPhone = '+5511999999999';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/public/booking/appointments',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      payload: {
        hostname,
        locationId,
        professionalId,
        serviceIds: [serviceId],
        startsAt: nextMonday.toISOString(),
        idempotencyKey,
        customer: {
          name: 'Public Customer',
          phone: customerPhone,
          email: 'public@example.com',
          notes: 'First time',
        },
      },
    });

    if (response.statusCode !== 201) {
      console.log('POST /appointments failed:', response.json());
    }
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe('CONFIRMED');
    expect(Object.keys(body).sort()).toEqual(['endsAt', 'id', 'startsAt', 'status', 'totalCents']);

    // Verify customer was created
    const customer = await db.customer.findFirst({ where: { tenantId, phone: customerPhone } });
    expect(customer).not.toBeNull();
    expect(customer?.name).toBe('Public Customer');
  });

  test('does not expose private appointment snapshots through public availability', async () => {
    const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const response = await app.inject({ method: 'GET', url: `/v1/public/booking/availability?hostname=${hostname}&locationId=${locationId}&professionalId=${professionalId}&serviceIds=${serviceId}&date=${date}&appointmentId=private-booking` });
    expect(response.statusCode).toBe(400);
  });

  test('preserves existing customer data and returns only the public receipt', async () => {
    const customer = await db.customer.create({ data: { tenantId, name: 'Private original', phone: '+5511888888888', email: 'private@example.test', notes: 'Private staff note', whatsappOptInAt: new Date() } });
    const nextMonday = new Date();
    nextMonday.setUTCDate(nextMonday.getUTCDate() + ((1 + 7 - nextMonday.getUTCDay()) % 7 || 7)); nextMonday.setUTCHours(11, 0, 0, 0);
    const payload = { hostname, locationId, professionalId, serviceIds: [serviceId], startsAt: nextMonday.toISOString(), idempotencyKey: randomUUID(), customer: { name: 'Unverified replacement', phone: customer.phone, email: null, notes: null } };
    const response = await app.inject({ method: 'POST', url: '/v1/public/booking/appointments', payload });
    expect((await app.inject({ method: 'POST', url: '/v1/public/booking/appointments', payload: { ...payload, verificationToken: 'unused' } })).statusCode).toBe(400);
    expect(response.statusCode, response.body).toBe(201);
    const saved = await db.customer.findFirstOrThrow({ where: { tenantId, id: customer.id } });
    expect(saved).toMatchObject({ name: customer.name, email: customer.email, notes: customer.notes, version: customer.version });
    expect(response.body).not.toContain('Private');
    expect(await db.notification.count({ where: { tenantId, appointmentId: response.json().id } })).toBe(0);
    expect((await app.inject({ method: 'POST', url: '/v1/public/booking/appointments', payload: { ...payload, customer: { ...payload.customer, name: 'Changed' } } })).statusCode).toBe(409);
  });
});

