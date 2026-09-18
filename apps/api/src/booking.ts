import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@platform/database';
import { requirePermission } from '@platform/tenancy';
import { addCalendarDays, assertWeeklyWindows, availableSlots, calendarDay, canTransition, intervalFits, isCalendarDate, localDate, occupyingStatuses, workingIntervals, type CalendarDay, type TimeRange } from '@platform/booking';
import { AccessError, type AppointmentDay, type AppointmentView, type AvailabilityView, type BookingOptions, type CustomerView, type PermissionKey, type ScheduleView, type TenantContext, type TimeOffView } from '@platform/types';
import { z } from 'zod';

const minuteMs = 60_000;
const dayMs = 1_440 * minuteMs;
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const instant = z.iso.datetime({ offset: true }).max(64).transform(value => new Date(value));
const versionSchema = z.number().int().positive();
const date = z.string().refine(isCalendarDate);
const notes = z.string().max(2_000).nullable();
const reason = z.string().max(500).nullable();
const serviceIdsSchema = z.array(id).min(1).max(10).refine(ids => new Set(ids).size === ids.length).transform(ids => [...ids].sort());
const weeklyWindow = z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1_439), endMinute: z.number().int().min(1).max(1_440) }).strict();
const windows = z.array(weeklyWindow).max(28).transform(value => { assertWeeklyWindows(value); return value; });
const scheduleQuery = z.object({ locationId: id }).strict();
const scheduleInput = z.object({
  locationId: id, expectedVersion: versionSchema, businessHours: windows,
  professionals: z.array(z.object({ professionalId: id, windows }).strict()).refine(items => new Set(items.map(item => item.professionalId)).size === items.length),
}).strict();
const timeOffInput = z.object({ locationId: id, professionalId: id.nullable(), startsAt: instant, endsAt: instant, reason }).strict();
const customerFields = {
  name: z.string().trim().min(1).max(120), phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  email: z.string().trim().max(254).email().toLowerCase().nullable(), notes,
};
const customerInput = z.object({ ...customerFields, whatsappOptIn: z.boolean().optional() }).strict();
const customerUpdate = z.object({ ...customerFields, whatsappOptIn: z.boolean().optional(), expectedVersion: versionSchema }).strict();

const publicAppointmentInput = z.object({
  locationId: id,
  professionalId: id,
  serviceIds: serviceIdsSchema,
  startsAt: instant,
  notes: z.string().max(2000).nullable().optional(),
  idempotencyKey: id,
  customer: z.object({ ...customerFields, whatsappOptIn: z.boolean().default(false) }).strict(),
}).strict();

const customerQuery = z.object({ q: z.string().trim().max(80).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
const availabilityQuery = z.object({
  locationId: id, professionalId: id, date,
  serviceIds: z.string().max(1_289).transform(value => serviceIdsSchema.parse(value.split(','))), appointmentId: id.optional(),
}).strict();
const appointmentQuery = z.object({ locationId: id, date }).strict();
const appointmentInput = z.object({
  locationId: id, professionalId: id, customerId: id, serviceIds: serviceIdsSchema, startsAt: instant,
  notes, idempotencyKey: z.string().min(1).max(128),
}).strict();
const rescheduleInput = z.object({ startsAt: instant, expectedVersion: versionSchema }).strict();
const transitionInput = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
  expectedVersion: versionSchema, reason,
}).strict();

const locationSelect = { id: true, name: true, active: true, timezone: true, version: true } as const;
const customerSelect = { id: true, name: true, phone: true, email: true, notes: true, version: true, whatsappOptInAt: true } as const;
const serviceSelect = { id: true, locationId: true, name: true, description: true, durationMinutes: true, priceCents: true, active: true, version: true } as const;
const weeklySelect = { weekday: true, startMinute: true, endMinute: true } as const;
const timeOffSelect = { id: true, professionalId: true, startsAt: true, endsAt: true, reason: true } as const;
const byName = [{ name: 'asc' }, { id: 'asc' }] as const;
const weeklyOrder = [{ weekday: 'asc' }, { startMinute: 'asc' }] as const;
function appointmentSelect(tenantId: string) {
  return {
    id: true, locationId: true, professionalId: true, status: true, startsAt: true, endsAt: true,
    totalCents: true, notes: true, version: true, requestHash: true,
    professional: { select: { name: true } }, customer: { select: { id: true, name: true, phone: true } },
    services: { where: { tenantId }, select: { serviceId: true, name: true, durationMinutes: true, priceCents: true }, orderBy: { serviceId: 'asc' } },
  } as const satisfies Prisma.AppointmentSelect;
}
type AppointmentRecord = Prisma.AppointmentGetPayload<{ select: ReturnType<typeof appointmentSelect> }>;
type LocationRecord = Prisma.LocationGetPayload<{ select: typeof locationSelect }>;
type CustomerRecord = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
type TimeOffRecord = Prisma.TimeOffGetPayload<{ select: typeof timeOffSelect }>;
type Tx = Prisma.TransactionClient;
type Offering = { location: LocationRecord; services: { serviceId: string; name: string; durationMinutes: number; priceCents: number }[]; durationMinutes: number; totalCents: number };

function appointmentView(record: AppointmentRecord): AppointmentView {
  return {
    id: record.id, locationId: record.locationId, professionalId: record.professionalId, professionalName: record.professional.name,
    customer: record.customer, status: record.status, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(),
    totalCents: record.totalCents, notes: record.notes, version: record.version, services: record.services,
  };
}
function customerView(record: CustomerRecord): CustomerView { return { ...record, whatsappOptInAt: record.whatsappOptInAt?.toISOString() ?? null }; }
function publicReceipt(record: AppointmentRecord) { return { id: record.id, status: record.status, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(), totalCents: record.totalCents }; }
function locationView(record: LocationRecord) { return { ...record, version: record.version }; }
function timeOffView(record: TimeOffRecord): TimeOffView { return { ...record, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString() }; }
function timeRange(record: { startsAt: Date; endsAt: Date }): TimeRange { return { startsAt: record.startsAt.getTime(), endsAt: record.endsAt.getTime() }; }
function authorize(context: TenantContext, permission: PermissionKey) { requirePermission(context, permission); }
function professionalScope(context: TenantContext) { return context.permissions.includes('appointments.manage_all') ? undefined : context.userId; }
function expectVersion(actual: number, expected: number) { if (actual !== expected) throw new AccessError('CONFLICT'); }

function databaseConflict(error: unknown, visited = new Set<unknown>()): boolean {
  if (typeof error === 'string') return ['P2002', 'P2034', '23505', '23P01', '40001', '40P01'].includes(error) || error.includes('appointments_no_professional_overlap');
  if (!error || typeof error !== 'object' || visited.has(error)) return false;
  visited.add(error);
  return Object.values(error).some(value => databaseConflict(value, visited))
    || (error instanceof Error && (databaseConflict(error.message, visited) || databaseConflict(error.cause, visited)));
}
async function lockLocation(tx: Tx, tenantId: string, locationId: string) {
  const key = `booking:${tenantId}:${locationId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
async function findLocation(tx: Tx, tenantId: string, locationId: string, active = false): Promise<LocationRecord> {
  const location = await tx.location.findFirst({ where: { tenantId, id: locationId, ...(active ? { active: true } : {}) }, select: locationSelect });
  if (!location) throw new AccessError('NOT_FOUND');
  return location;
}
async function findAppointment(tx: Tx, tenantId: string, resourceId: string): Promise<AppointmentRecord> {
  const record = await tx.appointment.findFirst({ where: { tenantId, id: resourceId }, select: appointmentSelect(tenantId) });
  if (!record) throw new AccessError('NOT_FOUND');
  return record;
}
async function audit(tx: Tx, context: TenantContext | { tenantId: string; actorUserId: string | null }, action: string, resource: string, resourceId: string) {
  const tenantId = 'tenant' in context ? context.tenant.id : context.tenantId;
  const actorUserId = 'userId' in context ? context.userId : ('actorUserId' in context ? context.actorUserId : null);
  await tx.auditLog.create({ data: { tenantId, actorUserId, action, resource, resourceId } });
}
async function bumpLocation(tx: Tx, tenantId: string, location: LocationRecord) {
  const result = await tx.location.updateMany({
    where: { tenantId, id: location.id, version: location.version }, data: { version: { increment: 1 } },
  });
  if (result.count !== 1) throw new AccessError('CONFLICT');
}

export class BookingService {
  constructor(private readonly db: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private async transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    try { return await this.db.$transaction(callback, { maxWait: 10_000, timeout: 30_000 }); }
    catch (error) { if (databaseConflict(error)) throw new AccessError('CONFLICT'); throw error; }
  }

  async getOptions(context: TenantContext): Promise<BookingOptions> {
    authorize(context, 'appointments.read');
    const tenantId = context.tenant.id;
    const [locations, professionals, services] = await Promise.all([
      this.db.location.findMany({ where: { tenantId }, select: locationSelect, orderBy: [...byName] }),
      this.db.professional.findMany({ where: { tenantId }, select: { id: true, locationId: true, name: true, active: true, services: { where: { tenantId }, select: { serviceId: true } } }, orderBy: [...byName] }),
      this.db.service.findMany({ where: { tenantId }, select: serviceSelect, orderBy: [...byName] }),
    ]);
    return {
      locations: locations.map(locationView),
      professionals: professionals.map(({ services: links, ...item }) => ({ ...item, serviceIds: links.map(link => link.serviceId).sort() })),
      services,
    };
  }

  private async schedule(tx: Tx, tenantId: string, locationId: string, professionalUserId?: string): Promise<ScheduleView> {
    const location = await findLocation(tx, tenantId, locationId);
    const [businessHours, professionals, timeOffs] = await Promise.all([
      tx.businessHour.findMany({ where: { tenantId, locationId }, select: weeklySelect, orderBy: [...weeklyOrder] }),
      tx.professional.findMany({ where: { tenantId, locationId, ...(professionalUserId ? { userId: professionalUserId } : {}) }, select: { id: true, name: true, active: true, schedules: { where: { tenantId, locationId }, select: weeklySelect, orderBy: [...weeklyOrder] } }, orderBy: [...byName] }),
      tx.timeOff.findMany({ where: { tenantId, locationId, endsAt: { gt: this.now() }, ...(professionalUserId ? { professional: { userId: professionalUserId } } : {}) }, select: timeOffSelect, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] }),
    ]);
    return { location: locationView(location), businessHours, professionals: professionals.map(({ schedules, ...item }) => ({ ...item, windows: schedules })), timeOffs: timeOffs.map(timeOffView) };
  }

  async getSchedule(context: TenantContext, query: unknown): Promise<ScheduleView> {
    authorize(context, 'appointments.read');
    const { locationId } = scheduleQuery.parse(query);
    const professionalUserId = professionalScope(context);
    return this.schedule(this.db, context.tenant.id, locationId, professionalUserId);
  }

  async updateSchedule(context: TenantContext, input: unknown): Promise<ScheduleView> {
    authorize(context, 'schedules.manage');
    const fields = scheduleInput.parse(input);
    const tenantId = context.tenant.id;
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, fields.locationId);
      const location = await findLocation(tx, tenantId, fields.locationId);
      expectVersion(location.version, fields.expectedVersion);
      const professionals = await tx.professional.findMany({
        where: { tenantId, locationId: location.id },
        select: { id: true, schedules: { where: { tenantId, locationId: location.id }, select: weeklySelect } },
      });
      const schedules = new Map(professionals.map(item => [item.id, item.schedules]));
      for (const item of fields.professionals) {
        if (!schedules.has(item.professionalId)) throw new AccessError('NOT_FOUND');
        schedules.set(item.professionalId, item.windows);
      }
      const appointments = await tx.appointment.findMany({
        where: { tenantId, locationId: location.id, endsAt: { gt: this.now() }, status: { in: [...occupyingStatuses] } },
        select: { professionalId: true, startsAt: true, endsAt: true },
      });
      const days = new Map<string, CalendarDay>();
      for (const appointment of appointments) {
        const localDay = localDate(appointment.startsAt, location.timezone);
        let day = days.get(localDay);
        if (!day) { day = calendarDay(localDay, location.timezone); days.set(localDay, day); }
        if (!intervalFits(timeRange(appointment), workingIntervals(day, fields.businessHours, schedules.get(appointment.professionalId) ?? []))) throw new AccessError('CONFLICT');
      }
      await tx.businessHour.deleteMany({ where: { tenantId, locationId: location.id } });
      if (fields.businessHours.length) await tx.businessHour.createMany({ data: fields.businessHours.map(window => ({ ...window, tenantId, locationId: location.id })) });
      for (const professional of fields.professionals) {
        await tx.professionalSchedule.deleteMany({ where: { tenantId, locationId: location.id, professionalId: professional.professionalId } });
        if (professional.windows.length) await tx.professionalSchedule.createMany({ data: professional.windows.map(window => ({ ...window, tenantId, locationId: location.id, professionalId: professional.professionalId })) });
      }
      await bumpLocation(tx, tenantId, location);
      await audit(tx, context, 'schedule.updated', 'Location', location.id);
      return this.schedule(tx, tenantId, location.id);
    });
  }

  async createTimeOff(context: TenantContext, input: unknown): Promise<TimeOffView> {
    authorize(context, 'schedules.manage');
    const fields = timeOffInput.parse(input);
    const tenantId = context.tenant.id;
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, fields.locationId);
      const location = await findLocation(tx, tenantId, fields.locationId);
      if (fields.startsAt < this.now() || fields.endsAt <= fields.startsAt || fields.endsAt.getTime() - fields.startsAt.getTime() > 366 * dayMs) throw new AccessError('INVALID_INPUT');
      if (fields.professionalId && !await tx.professional.findFirst({ where: { tenantId, locationId: location.id, id: fields.professionalId }, select: { id: true } })) throw new AccessError('NOT_FOUND');
      const collision = await tx.appointment.findFirst({ where: {
        tenantId, locationId: location.id, ...(fields.professionalId ? { professionalId: fields.professionalId } : {}),
        startsAt: { lt: fields.endsAt }, endsAt: { gt: fields.startsAt }, status: { in: [...occupyingStatuses] },
      }, select: { id: true } });
      if (collision) throw new AccessError('CONFLICT');
      const result = await tx.timeOff.create({ data: { ...fields, tenantId }, select: timeOffSelect });
      await bumpLocation(tx, tenantId, location);
      await audit(tx, context, 'time_off.created', 'TimeOff', result.id);
      return timeOffView(result);
    });
  }

  async deleteTimeOff(context: TenantContext, resourceId: string): Promise<{ deleted: true }> {
    authorize(context, 'schedules.manage');
    id.parse(resourceId);
    const tenantId = context.tenant.id;
    const candidate = await this.db.timeOff.findFirst({ where: { tenantId, id: resourceId }, select: { locationId: true } });
    if (!candidate) throw new AccessError('NOT_FOUND');
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, candidate.locationId);
      const location = await findLocation(tx, tenantId, candidate.locationId);
      const result = await tx.timeOff.deleteMany({ where: { tenantId, locationId: candidate.locationId, id: resourceId } });
      if (result.count !== 1) throw new AccessError('NOT_FOUND');
      await bumpLocation(tx, tenantId, location);
      await audit(tx, context, 'time_off.deleted', 'TimeOff', resourceId);
      return { deleted: true };
    });
  }

  async listCustomers(context: TenantContext, query: unknown): Promise<{ items: CustomerView[]; page: number; hasMore: boolean }> {
    authorize(context, 'customers.read');
    const { q, page } = customerQuery.parse(query);
    const items = await this.db.customer.findMany({
      where: { tenantId: context.tenant.id, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q } }, { email: { contains: q, mode: 'insensitive' as const } }] } : {}) },
      select: customerSelect, skip: (page - 1) * 50, take: 51, orderBy: [...byName],
    });
    return { items: items.slice(0, 50).map(customerView), page, hasMore: items.length > 50 };
  }

  async createCustomer(context: TenantContext, input: unknown): Promise<CustomerView> {
    authorize(context, 'customers.update');
    const { whatsappOptIn, ...fields } = customerInput.parse(input);
    return this.transaction(async tx => {
      const result = await tx.customer.create({ data: { ...fields, whatsappOptInAt: whatsappOptIn ? this.now() : null, tenantId: context.tenant.id }, select: customerSelect });
      await audit(tx, context, 'customer.created', 'Customer', result.id);
      if (whatsappOptIn) await audit(tx, context, 'customer.whatsapp_opted_in', 'Customer', result.id);
      return customerView(result);
    });
  }

  async updateCustomer(context: TenantContext, resourceId: string, input: unknown): Promise<CustomerView> {
    authorize(context, 'customers.update');
    id.parse(resourceId);
    const { expectedVersion, whatsappOptIn, ...fields } = customerUpdate.parse(input);
    const tenantId = context.tenant.id;
    return this.transaction(async tx => {
      const current = await tx.customer.findFirst({ where: { tenantId, id: resourceId }, select: { version: true, phone: true, whatsappOptInAt: true } });
      if (!current) throw new AccessError('NOT_FOUND');
      expectVersion(current.version, expectedVersion);
      const whatsappOptInAt = whatsappOptIn === false || current.phone !== fields.phone ? null : whatsappOptIn === true ? current.whatsappOptInAt ?? this.now() : current.whatsappOptInAt;
      const changed = await tx.customer.updateMany({ where: { tenantId, id: resourceId, version: expectedVersion }, data: { ...fields, whatsappOptInAt, version: { increment: 1 } } });
      const result = await tx.customer.findFirst({ where: { tenantId, id: resourceId }, select: customerSelect });
      if (!result) throw new AccessError('NOT_FOUND');
      if (changed.count !== 1) throw new AccessError('CONFLICT');
      await audit(tx, context, 'customer.updated', 'Customer', resourceId);
      if (whatsappOptInAt?.getTime() !== current.whatsappOptInAt?.getTime()) await audit(tx, context, whatsappOptInAt ? 'customer.whatsapp_opted_in' : 'customer.whatsapp_opted_out', 'Customer', resourceId);
      return customerView(result);
    });
  }

  private async offering(tx: Tx, tenantId: string, locationId: string, professionalId: string, serviceIds: string[], appointmentId?: string): Promise<Offering> {
    const location = await findLocation(tx, tenantId, locationId, true);
    const professional = await tx.professional.findFirst({ where: { tenantId, locationId, id: professionalId, active: true }, select: { id: true } });
    if (!professional) throw new AccessError('NOT_FOUND');
    let services: Offering['services'];
    if (appointmentId) {
      const appointment = await findAppointment(tx, tenantId, appointmentId);
      if (appointment.locationId !== locationId || appointment.professionalId !== professionalId || appointment.services.map(item => item.serviceId).sort().join(',') !== serviceIds.join(',')) throw new AccessError('NOT_FOUND');
      if (appointment.status !== 'CONFIRMED' || appointment.startsAt <= this.now()) throw new AccessError('CONFLICT');
      services = appointment.services;
    } else {
      const records = await tx.service.findMany({ where: {
        tenantId, locationId, id: { in: serviceIds }, active: true,
        professionals: { some: { tenantId, locationId, professionalId } },
      }, select: { id: true, name: true, durationMinutes: true, priceCents: true }, orderBy: { id: 'asc' } });
      if (records.length !== serviceIds.length) throw new AccessError('NOT_FOUND');
      services = records.map(({ id: serviceId, ...record }) => ({ ...record, serviceId }));
    }
    const durationMinutes = services.reduce((sum, service) => sum + service.durationMinutes, 0);
    const totalCents = services.reduce((sum, service) => sum + service.priceCents, 0);
    if (!services.length || durationMinutes < 1 || durationMinutes > 1_440 || !Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 2_147_483_647) throw new AccessError('INVALID_INPUT');
    return { location, services, durationMinutes, totalCents };
  }

  private async slots(tx: Tx, tenantId: string, professionalId: string, offering: Offering, queryDate: string, appointmentId?: string): Promise<AvailabilityView> {
    const now = this.now();
    const today = localDate(now, offering.location.timezone);
    if (queryDate < today || queryDate > addCalendarDays(today, 366)) throw new AccessError('INVALID_INPUT');
    const day = calendarDay(queryDate, offering.location.timezone);
    const locationId = offering.location.id;
    const [businessHours, professionalHours, blocks, busy] = await Promise.all([
      tx.businessHour.findMany({ where: { tenantId, locationId, weekday: day.weekday }, select: weeklySelect }),
      tx.professionalSchedule.findMany({ where: { tenantId, locationId, professionalId, weekday: day.weekday }, select: weeklySelect }),
      tx.timeOff.findMany({ where: { tenantId, locationId, OR: [{ professionalId: null }, { professionalId }], startsAt: { lt: new Date(day.endsAt) }, endsAt: { gt: new Date(day.startsAt) } }, select: { startsAt: true, endsAt: true } }),
      tx.appointment.findMany({ where: {
        tenantId, locationId, professionalId, ...(appointmentId ? { id: { not: appointmentId } } : {}),
        startsAt: { lt: new Date(day.endsAt) }, endsAt: { gt: new Date(day.startsAt) }, status: { in: [...occupyingStatuses] },
      }, select: { startsAt: true, endsAt: true } }),
    ]);
    return { timezone: offering.location.timezone, durationMinutes: offering.durationMinutes, totalCents: offering.totalCents,
      slots: availableSlots({ day, businessHours, professionalHours, durationMinutes: offering.durationMinutes, blocked: [...blocks, ...busy].map(timeRange), now: now.getTime() }),
    };
  }

  async availability(context: TenantContext, query: unknown): Promise<AvailabilityView> {
    authorize(context, 'appointments.read');
    const fields = availabilityQuery.parse(query);
    const tenantId = context.tenant.id;
    const offering = await this.offering(this.db, tenantId, fields.locationId, fields.professionalId, fields.serviceIds, fields.appointmentId);
    return this.slots(this.db, context.tenant.id, fields.professionalId, offering, fields.date, fields.appointmentId);
  }

  async listAppointments(context: TenantContext, query: unknown): Promise<AppointmentDay> {
    authorize(context, 'appointments.read');
    const fields = appointmentQuery.parse(query);
    const tenantId = context.tenant.id;
    const professionalUserId = professionalScope(context);
    const location = await findLocation(this.db, tenantId, fields.locationId);
    const day = calendarDay(fields.date, location.timezone);
    const items = await this.db.appointment.findMany({
      where: { tenantId, locationId: location.id, startsAt: { lt: new Date(day.endsAt) }, endsAt: { gt: new Date(day.startsAt) }, ...(professionalUserId ? { professional: { userId: professionalUserId } } : {}) },
      select: appointmentSelect(tenantId), orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return { date: fields.date, timezone: location.timezone, items: items.map(appointmentView) };
  }

  async createAppointment(context: TenantContext, input: unknown): Promise<AppointmentView> {
    authorize(context, 'appointments.create');
    const fields = appointmentInput.parse(input);
    const tenantId = context.tenant.id;
    const requestHash = createHash('sha256').update(JSON.stringify({ actor: context.userId, locationId: fields.locationId, professionalId: fields.professionalId, customerId: fields.customerId, serviceIds: fields.serviceIds, startsAt: fields.startsAt.toISOString(), notes: fields.notes })).digest('hex');
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, fields.locationId);
      const existing = await tx.appointment.findFirst({ where: { tenantId, idempotencyKey: fields.idempotencyKey }, select: appointmentSelect(tenantId) });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new AccessError('CONFLICT');
        return appointmentView(existing);
      }
      const offering = await this.offering(tx, tenantId, fields.locationId, fields.professionalId, fields.serviceIds);
      const customer = await tx.customer.findFirst({ where: { tenantId, id: fields.customerId }, select: { id: true, name: true, phone: true } });
      if (!customer) throw new AccessError('NOT_FOUND');
      const availability = await this.slots(tx, tenantId, fields.professionalId, offering, localDate(fields.startsAt, offering.location.timezone));
      const slot = availability.slots.find(item => item.startsAt === fields.startsAt.toISOString());
      if (!slot) throw new AccessError('CONFLICT');
      const created = await tx.appointment.create({ data: {
        tenantId, locationId: fields.locationId, professionalId: fields.professionalId, customerId: fields.customerId,
        status: 'CONFIRMED', startsAt: fields.startsAt, endsAt: new Date(slot.endsAt), totalCents: offering.totalCents,
        notes: fields.notes, idempotencyKey: fields.idempotencyKey, requestHash,
      }, select: { id: true } });
      await tx.appointmentService.createMany({ data: offering.services.map(service => ({ ...service, tenantId, locationId: fields.locationId, appointmentId: created.id })) });
      await tx.appointmentEvent.create({ data: { tenantId, locationId: fields.locationId, appointmentId: created.id, actorUserId: context.userId, fromStatus: null, toStatus: 'CONFIRMED' } });
      await audit(tx, context, 'appointment.created', 'Appointment', created.id);
      

      
      return appointmentView(await findAppointment(tx, tenantId, created.id));
    });
  }

  async reschedule(context: TenantContext, resourceId: string, input: unknown): Promise<AppointmentView> {
    authorize(context, 'appointments.update');
    id.parse(resourceId);
    const fields = rescheduleInput.parse(input);
    const tenantId = context.tenant.id;
    const professionalUserId = professionalScope(context);
    const candidate = await findAppointment(this.db, tenantId, resourceId);
    if (professionalUserId) {
      const isMine = await this.db.professional.findFirst({ where: { tenantId, locationId: candidate.locationId, id: candidate.professionalId, userId: professionalUserId } });
      if (!isMine) throw new AccessError('NOT_FOUND');
    }
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, candidate.locationId);
      const current = await findAppointment(tx, tenantId, resourceId);
      expectVersion(current.version, fields.expectedVersion);
      const offering = await this.offering(tx, tenantId, current.locationId, current.professionalId, current.services.map(service => service.serviceId).sort(), current.id);
      const availability = await this.slots(tx, tenantId, current.professionalId, offering, localDate(fields.startsAt, offering.location.timezone), current.id);
      const slot = availability.slots.find(item => item.startsAt === fields.startsAt.toISOString());
      if (!slot) throw new AccessError('CONFLICT');
      const result = await tx.appointment.updateMany({ where: { tenantId, id: resourceId, version: fields.expectedVersion }, data: { startsAt: fields.startsAt, endsAt: new Date(slot.endsAt), version: { increment: 1 } } });
      if (result.count !== 1) throw new AccessError('CONFLICT');
      await tx.appointmentEvent.create({ data: { tenantId, locationId: current.locationId, appointmentId: resourceId, actorUserId: context.userId, fromStatus: current.status, toStatus: current.status, reason: 'Reagendamento' } });
      await audit(tx, context, 'appointment.rescheduled', 'Appointment', resourceId);
      return appointmentView(await findAppointment(tx, tenantId, resourceId));
    });
  }

  async transition(context: TenantContext, resourceId: string, input: unknown): Promise<AppointmentView> {
    authorize(context, 'appointments.update');
    id.parse(resourceId);
    const fields = transitionInput.parse(input);
    const tenantId = context.tenant.id;
    const professionalUserId = professionalScope(context);
    const candidate = await findAppointment(this.db, tenantId, resourceId);
    if (professionalUserId) {
      const isMine = await this.db.professional.findFirst({ where: { tenantId, locationId: candidate.locationId, id: candidate.professionalId, userId: professionalUserId } });
      if (!isMine) throw new AccessError('NOT_FOUND');
    }
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, candidate.locationId);
      const current = await findAppointment(tx, tenantId, resourceId);
      expectVersion(current.version, fields.expectedVersion);
      if (!canTransition(current.status, fields.status, current.startsAt.getTime(), this.now().getTime())) throw new AccessError('CONFLICT');
      const result = await tx.appointment.updateMany({ where: { tenantId, id: resourceId, version: fields.expectedVersion }, data: { status: fields.status, version: { increment: 1 } } });
      if (result.count !== 1) throw new AccessError('CONFLICT');
      await tx.appointmentEvent.create({ data: { tenantId, locationId: current.locationId, appointmentId: resourceId, actorUserId: context.userId, fromStatus: current.status, toStatus: fields.status, reason: fields.reason } });
      await audit(tx, context, 'appointment.status_changed', 'Appointment', resourceId);
      

      
      return appointmentView(await findAppointment(tx, tenantId, resourceId));
    });
  }

  async getPublicAvailability(tenantId: string, query: unknown): Promise<AvailabilityView> {
    const fields = availabilityQuery.omit({ appointmentId: true }).parse(query);
    const offering = await this.offering(this.db, tenantId, fields.locationId, fields.professionalId, fields.serviceIds);
    return this.slots(this.db, tenantId, fields.professionalId, offering, fields.date);
  }

  async createPublicAppointment(tenantId: string, input: unknown) {
    const fields = publicAppointmentInput.parse(input);
    const requestHash = createHash('sha256').update(JSON.stringify({ actor: 'public', locationId: fields.locationId, professionalId: fields.professionalId, customer: fields.customer, serviceIds: fields.serviceIds, startsAt: fields.startsAt.toISOString(), notes: fields.notes })).digest('hex');
    
    return this.transaction(async tx => {
      await lockLocation(tx, tenantId, fields.locationId);
      
      const existing = await tx.appointment.findFirst({ where: { tenantId, idempotencyKey: fields.idempotencyKey }, select: appointmentSelect(tenantId) });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new AccessError('CONFLICT');
        return publicReceipt(existing);
      }
      
      const offering = await this.offering(tx, tenantId, fields.locationId, fields.professionalId, fields.serviceIds);
      
      let customer = await tx.customer.findFirst({ where: { tenantId, phone: fields.customer.phone }, select: { id: true, whatsappOptInAt: true } });
      if (!customer) {
        customer = await tx.customer.create({ data: { tenantId, name: fields.customer.name, phone: fields.customer.phone, email: fields.customer.email, notes: fields.customer.notes, whatsappOptInAt: fields.customer.whatsappOptIn ? this.now() : null }, select: { id: true, whatsappOptInAt: true } });
      }
      // A public phone number does not prove identity or authorize changes to an existing customer's consent.
      
      const availability = await this.slots(tx, tenantId, fields.professionalId, offering, localDate(fields.startsAt, offering.location.timezone));
      const slot = availability.slots.find(item => item.startsAt === fields.startsAt.toISOString());
      if (!slot) throw new AccessError('CONFLICT');
      
      const created = await tx.appointment.create({ data: {
        tenantId, locationId: fields.locationId, professionalId: fields.professionalId, customerId: customer.id,
        status: 'CONFIRMED', startsAt: fields.startsAt, endsAt: new Date(slot.endsAt), totalCents: offering.totalCents,
        notes: fields.notes ?? null, idempotencyKey: fields.idempotencyKey, requestHash,
      }, select: { id: true } });
      
      await tx.appointmentService.createMany({ data: offering.services.map(service => ({ ...service, tenantId, locationId: fields.locationId, appointmentId: created.id })) });
      await tx.appointmentEvent.create({ data: { tenantId, locationId: fields.locationId, appointmentId: created.id, actorUserId: null, fromStatus: null, toStatus: 'CONFIRMED' } });
      
      await audit(tx, { tenantId, actorUserId: null }, 'appointment.created', 'Appointment', created.id);
      
      
      return publicReceipt(await findAppointment(tx, tenantId, created.id));
    });
  }
}

