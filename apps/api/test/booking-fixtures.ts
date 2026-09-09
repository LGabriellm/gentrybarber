import { randomBytes, randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { emailJobSchema, type EmailMessage, type NotificationProvider } from '@platform/notifications';
import type { AppointmentView, CreateAppointmentInput, WeeklyWindow } from '@platform/types';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error('DATABASE_TEST_URL is required for the real booking API integration suite.');
const target = new URL(databaseUrl);
if (!['postgresql:', 'postgres:'].includes(target.protocol) || !decodeURIComponent(target.pathname.slice(1)).endsWith('_test')) {
  throw new Error('Booking integration tests require a dedicated PostgreSQL database whose name ends in _test.');
}

class CapturedEmail implements NotificationProvider {
  readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(emailJobSchema.parse(message)); }
  verificationFor(recipient: string) {
    const message = this.messages.find(item => item.to === recipient);
    const address = message?.text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!address) throw new Error('Missing verification message for this fictitious booking account.');
    return new URL(address);
  }
}

export const bookingDb = createDatabase(databaseUrl);
export const bookingPrefix = `booking-it-${randomBytes(8).toString('hex')}`;
export const origin = 'http://localhost:3001';
const email = new CapturedEmail();
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Booking integration', PLATFORM_DOMAIN: 'platform.test',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: origin,
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Integration <noreply@example.test>',
});
const tenantKeys = ['a', 'b', 'foreign', 'barber', 'no-action', 'no-booking', 'no-customers', 'inactive-member', 'inactive-tenant'] as const;
export type BookingTenantKey = typeof tenantKeys[number];
export const bookingTenant = (key: BookingTenantKey = 'a') => `${bookingPrefix}-${key}`;
export const bookingRoute = (path: string, tenant: BookingTenantKey = 'a') => `/v1/tenants/${bookingTenant(tenant)}${path}`;
const planId = `${bookingPrefix}-plan`;
const roles = { owner: `${bookingPrefix}-owner`, barber: `${bookingPrefix}-barber`, noAction: `${bookingPrefix}-no-action` };
const actionPermissions = ['appointments.read', 'appointments.create', 'appointments.update', 'schedules.manage', 'customers.read', 'customers.update'] as const;
const ownedFeatures: string[] = [];
const ownedPermissions: string[] = [];
const ownedEmails: string[] = [];
const clientSubnet = [...randomBytes(2)].map(value => (value % 254) + 1).join('.');
const rateLimitScope = { key: { startsWith: `127.${clientSubnet}.` } };
let previousRateLimitIds: string[] = [];
let requestCount = 0;
export let operator: { id: string; cookie: string };
export let colleague: { id: string; cookie: string };
type Application = Awaited<ReturnType<typeof createApplication>>;
type ApiServer = ReturnType<ReturnType<Application['getHttpAdapter']>['getInstance']>;
let app: Application | undefined;
let server: ApiServer;
const auditFailureName = `booking_audit_fail_${randomBytes(8).toString('hex')}`;
let auditFailureFunction = false;
let auditFailureTrigger = false;

export function bookingGet(url: string, session: string | null = operator.cookie) {
  return server.inject({ method: 'GET', url, remoteAddress: `127.${clientSubnet}.${(requestCount++ % 250) + 1}`, headers: session ? { cookie: session } : {} });
}
export function bookingWrite(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload: unknown, options: { session?: string | null; origin?: string | null; contentType?: string } = {}) {
  const session = options.session === undefined ? operator?.cookie : options.session;
  const requestOrigin = options.origin === undefined ? origin : options.origin;
  return server.inject({
    method, url, remoteAddress: `127.${clientSubnet}.${(requestCount++ % 250) + 1}`, payload: JSON.stringify(payload),
    headers: { 'content-type': options.contentType ?? 'application/json', ...(session ? { cookie: session } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}) },
  });
}
export function bookingError(response: LightMyRequestResponse, status: number, error: string) {
  expect(response.statusCode, response.body).toBe(status);
  expect(response.json()).toEqual({ error });
  expect(response.headers['cache-control']).toBe('no-store');
}
export const futureDate = (days = 2) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
export function dateInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const field = (key: string) => parts.find(part => part.type === key)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}

/** Fixture conversion is checked against Intl; no browser timezone or fixed UTC offset is used. */
export function fixtureInstant(date: string, hour: number, minute = 0, timezone = 'America/Sao_Paulo'): string {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  const localTarget = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = localTarget;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const field = (key: string) => Number(parts.find(part => part.type === key)!.value);
    const rendered = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'));
    if (rendered === localTarget) return new Date(candidate).toISOString();
    candidate += localTarget - rendered;
  }
  throw new Error('The fixture must use an unambiguous, existing local time.');
}
export const weekWindows = (windows: [number, number][]): WeeklyWindow[] => Array.from({ length: 7 }, (_, weekday) => windows.map(([startMinute, endMinute]) => ({ weekday, startMinute, endMinute }))).flat();
export const newPhone = () => `+5511${String(BigInt(`0x${randomBytes(6).toString('hex')}`) % 10_000_000_000n).padStart(10, '0')}`;

export interface BookingFixture {
  tenant: BookingTenantKey;
  tenantId: string;
  locationId: string;
  professionalId: string;
  otherProfessionalId: string;
  customerId: string;
  serviceId: string;
  secondServiceId: string;
  unassignedServiceId: string;
  inactiveServiceId: string;
  timezone: string;
  date: string;
  at(hour: number, minute?: number): string;
}
export async function createBookingFixture(tenant: BookingTenantKey = 'a', timezone = 'America/Sao_Paulo'): Promise<BookingFixture> {
  const token = `${bookingPrefix}-${randomBytes(5).toString('hex')}`;
  const fixture: BookingFixture = {
    tenant, tenantId: bookingTenant(tenant), locationId: `${token}-unit`, professionalId: `${token}-pro`, otherProfessionalId: `${token}-other-pro`,
    customerId: `${token}-customer`, serviceId: `${token}-cut`, secondServiceId: `${token}-beard`,
    unassignedServiceId: `${token}-unassigned`, inactiveServiceId: `${token}-inactive`, timezone, date: futureDate(),
    at(hour, minute = 0) { return fixtureInstant(this.date, hour, minute, this.timezone); },
  };
  await bookingDb.location.create({ data: { id: fixture.locationId, tenantId: fixture.tenantId, name: 'Fictitious booking unit', slug: `${token}-unit`, timezone } });
  await bookingDb.professional.createMany({ data: [fixture.professionalId, fixture.otherProfessionalId].map(id => ({ id, tenantId: fixture.tenantId, locationId: fixture.locationId, name: 'Fictitious booking professional' })) });
  await bookingDb.service.createMany({ data: [
    { id: fixture.serviceId, name: 'Contracted fictitious cut', durationMinutes: 30, priceCents: 4500, active: true },
    { id: fixture.secondServiceId, name: 'Contracted fictitious beard', durationMinutes: 15, priceCents: 2000, active: true },
    { id: fixture.unassignedServiceId, name: 'Unassigned fictitious service', durationMinutes: 30, priceCents: 5000, active: true },
    { id: fixture.inactiveServiceId, name: 'Inactive fictitious service', durationMinutes: 15, priceCents: 1000, active: false },
  ].map(item => ({ ...item, tenantId: fixture.tenantId, locationId: fixture.locationId })) });
  await bookingDb.professionalService.createMany({ data: [fixture.professionalId, fixture.otherProfessionalId].flatMap(professionalId => [fixture.serviceId, fixture.secondServiceId, fixture.inactiveServiceId].map(serviceId => ({ tenantId: fixture.tenantId, locationId: fixture.locationId, professionalId, serviceId }))) });
  await bookingDb.customer.create({ data: { id: fixture.customerId, tenantId: fixture.tenantId, name: 'Fictitious appointment customer', phone: newPhone() } });
  await bookingDb.businessHour.createMany({ data: weekWindows([[540, 720], [780, 1080]]).map(window => ({ ...window, tenantId: fixture.tenantId, locationId: fixture.locationId })) });
  await bookingDb.professionalSchedule.createMany({ data: [fixture.professionalId, fixture.otherProfessionalId].flatMap(professionalId => weekWindows([[570, 720], [780, 1020]]).map(window => ({ ...window, tenantId: fixture.tenantId, locationId: fixture.locationId, professionalId }))) });
  return fixture;
}
export function appointmentInput(fixture: BookingFixture, overrides: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput {
  return { locationId: fixture.locationId, professionalId: fixture.professionalId, customerId: fixture.customerId, serviceIds: [fixture.serviceId], startsAt: fixture.at(10), notes: null, idempotencyKey: randomUUID(), ...overrides };
}
export function availabilityUrl(fixture: BookingFixture, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({ locationId: fixture.locationId, professionalId: fixture.professionalId, date: fixture.date, serviceIds: fixture.serviceId, ...overrides });
  return bookingRoute(`/availability?${params}`, fixture.tenant);
}
export async function createAppointment(fixture: BookingFixture, overrides: Partial<CreateAppointmentInput> = {}): Promise<AppointmentView> {
  const response = await bookingWrite('POST', bookingRoute('/appointments', fixture.tenant), appointmentInput(fixture, overrides));
  expect(response.statusCode, response.body).toBe(201);
  return response.json<AppointmentView>();
}
export async function insertLegacyAppointment(fixture: BookingFixture, startsAt: Date, durationMinutes = 30) {
  return bookingDb.appointment.create({ data: {
    tenantId: fixture.tenantId, locationId: fixture.locationId, professionalId: fixture.professionalId, customerId: fixture.customerId,
    status: 'CONFIRMED', startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000), totalCents: 4500,
    services: { create: { serviceId: fixture.serviceId, name: 'Legacy fictitious cut', durationMinutes, priceCents: 4500 } },
  } });
}

async function registerOperator(label: string) {
  const recipient = `${bookingPrefix}-${label}@example.test`;
  const password = `Fixture-${randomBytes(24).toString('hex')}`;
  ownedEmails.push(recipient);
  const signup = await bookingWrite('POST', '/api/auth/sign-up/email', { email: recipient, password, name: `Fictitious booking ${label}` }, { session: null });
  expect(signup.statusCode, signup.body).toBe(200);
  const id = signup.json<{ user: { id: string } }>().user.id;
  const verification = email.verificationFor(recipient);
  const verified = await bookingGet(`${verification.pathname}${verification.search}`, null);
  expect([200, 302]).toContain(verified.statusCode);
  const login = await bookingWrite('POST', '/api/auth/sign-in/email', { email: recipient, password }, { session: null });
  expect(login.statusCode, login.body).toBe(200);
  const setCookie = login.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : typeof setCookie === 'string' ? [setCookie] : [];
  expect(cookies.some(value => value.startsWith('better-auth.session_token='))).toBe(true);
  return { id, cookie: cookies.map(value => value.split(';')[0]).join('; ') };
}
export async function setupBookingTests() {
  previousRateLimitIds = (await bookingDb.rateLimit.findMany({ where: rateLimitScope, select: { id: true } })).map(item => item.id);
  await bookingDb.plan.create({ data: { id: planId, key: planId, name: 'Configurable booking fixture plan' } });
  const featureIds = new Map<string, string>();
  for (const key of ['booking', 'customers'] as const) {
    const id = `${bookingPrefix}-feature-${key}`;
    const feature = await bookingDb.feature.upsert({ where: { key }, create: { id, key, name: key }, update: {} });
    if (feature.id === id) ownedFeatures.push(id);
    featureIds.set(key, feature.id);
    await bookingDb.planFeature.create({ data: { planId, featureId: feature.id, enabled: true } });
  }
  await bookingDb.role.createMany({ data: Object.values(roles).map(id => ({ id, key: id, name: 'Fictitious booking role' })) });
  for (const key of ['appointments.manage_all', ...actionPermissions]) {
    const id = `${bookingPrefix}-permission-${key}`;
    const permission = await bookingDb.permission.upsert({ where: { key }, create: { id, key, description: key }, update: {} });
    if (permission.id === id) ownedPermissions.push(id);
    await bookingDb.rolePermission.createMany({ data: [roles.owner, key === 'appointments.manage_all' ? roles.noAction : roles.barber].map(roleId => ({ roleId, permissionId: permission.id })) });
  }
  await bookingDb.tenant.createMany({ data: tenantKeys.map(key => ({ id: bookingTenant(key), slug: bookingTenant(key), name: `Fictitious booking ${key}`, planId, status: key === 'inactive-tenant' ? 'SUSPENDED' as const : 'ACTIVE' as const })) });
  await bookingDb.tenantFeatureOverride.createMany({ data: [
    { tenantId: bookingTenant('no-booking'), featureId: featureIds.get('booking')!, enabled: false, reason: 'Fictitious booking denial' },
    { tenantId: bookingTenant('no-customers'), featureId: featureIds.get('customers')!, enabled: false, reason: 'Fictitious customer denial' },
  ] });
  app = await createApplication(config, new FoundationServices(bookingDb, createAuth(bookingDb, config, email), config));
  server = app.getHttpAdapter().getInstance();
  operator = await registerOperator('operator');
  colleague = await registerOperator('colleague');
  await bookingDb.membership.createMany({ data: [
    ...tenantKeys.filter(key => key !== 'foreign').map(key => ({
      userId: operator.id, tenantId: bookingTenant(key), status: key === 'inactive-member' ? 'SUSPENDED' as const : 'ACTIVE' as const,
      roleId: key === 'barber' ? roles.barber : key === 'no-action' ? roles.noAction : roles.owner,
    })),
    { userId: colleague.id, tenantId: bookingTenant('a'), status: 'ACTIVE', roleId: roles.owner },
  ] });
}
export async function failBookingAudits() {
  // Locally generated identifiers and tenant ID scope the fault to this suite's own records.
  await bookingDb.$executeRawUnsafe(`CREATE FUNCTION "${auditFailureName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Booking fixture audit failure'; END $$`);
  auditFailureFunction = true;
  await bookingDb.$executeRawUnsafe(`CREATE TRIGGER "${auditFailureName}" BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.tenant_id = '${bookingTenant()}') EXECUTE FUNCTION "${auditFailureName}"()`);
  auditFailureTrigger = true;
}
export async function restoreBookingAudits() {
  if (auditFailureTrigger) {
    await bookingDb.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${auditFailureName}" ON audit_logs`);
    auditFailureTrigger = false;
  }
  if (auditFailureFunction) {
    await bookingDb.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${auditFailureName}"()`);
    auditFailureFunction = false;
  }
}
export async function cleanupBookingTests() {
  try {
    await app?.close();
    await restoreBookingAudits();
    const tenantIds = tenantKeys.map(bookingTenant);
    const ownUsers = (await bookingDb.user.findMany({ where: { email: { in: ownedEmails } }, select: { id: true } })).map(item => item.id);
    const tenantWhere = { tenantId: { in: tenantIds } };
    await bookingDb.$transaction([
      bookingDb.rateLimit.deleteMany({ where: { ...rateLimitScope, id: { notIn: previousRateLimitIds } } }),
      bookingDb.verification.deleteMany({ where: { OR: [{ value: { in: ownUsers } }, { identifier: { in: ownedEmails } }] } }),
      bookingDb.auditLog.deleteMany({ where: tenantWhere }),
      bookingDb.appointmentEvent.deleteMany({ where: tenantWhere }),
      bookingDb.appointmentService.deleteMany({ where: tenantWhere }),
      bookingDb.appointment.deleteMany({ where: tenantWhere }),
      bookingDb.timeOff.deleteMany({ where: tenantWhere }),
      bookingDb.businessHour.deleteMany({ where: tenantWhere }),
      bookingDb.professionalSchedule.deleteMany({ where: tenantWhere }),
      bookingDb.professionalService.deleteMany({ where: tenantWhere }),
      bookingDb.professional.deleteMany({ where: tenantWhere }),
      bookingDb.service.deleteMany({ where: tenantWhere }),
      bookingDb.customer.deleteMany({ where: tenantWhere }),
      bookingDb.location.deleteMany({ where: tenantWhere }),
      bookingDb.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      bookingDb.user.deleteMany({ where: { id: { in: ownUsers } } }),
      bookingDb.role.deleteMany({ where: { id: { in: Object.values(roles) } } }),
      bookingDb.plan.deleteMany({ where: { id: planId } }),
      bookingDb.permission.deleteMany({ where: { id: { in: ownedPermissions } } }),
      bookingDb.feature.deleteMany({ where: { id: { in: ownedFeatures } } }),
    ]);
  } finally { await bookingDb.$disconnect(); }
}
