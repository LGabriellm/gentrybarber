import type { Prisma, PrismaClient } from '@platform/database';
import { requirePermission } from '@platform/tenancy';
import { AccessError, type CatalogProfessional, type CatalogService as CatalogServiceItem, type ProfessionalCatalog, type ServiceCatalog, type TenantContext } from '@platform/types';
import { z } from 'zod';

const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const nameSchema = z.string().trim().min(1).max(120);
const textSchema = z.string().max(2_000).nullable();
const versionSchema = z.number().int().positive();
const serviceFields = {
  name: nameSchema,
  description: textSchema,
  durationMinutes: z.number().int().min(1).max(1_440),
  priceCents: z.number().int().min(0).max(100_000_000),
  active: z.boolean(),
};
const professionalFields = {
  name: nameSchema,
  bio: textSchema,
  active: z.boolean(),
  serviceIds: z.array(idSchema).max(100).refine(ids => new Set(ids).size === ids.length, 'Service ids must be distinct'),
  userId: idSchema.optional(),
};
const createServiceSchema = z.object({ ...serviceFields, locationId: idSchema }).strict();
const updateServiceSchema = z.object({ ...serviceFields, expectedVersion: versionSchema }).strict();
const createProfessionalSchema = z.object({ ...professionalFields, locationId: idSchema }).strict();
const updateProfessionalSchema = z.object({ ...professionalFields, expectedVersion: versionSchema }).strict();

const locationSelect = { id: true, name: true, active: true } as const satisfies Prisma.LocationSelect;
const serviceSelect = {
  id: true, locationId: true, name: true, description: true,
  durationMinutes: true, priceCents: true, active: true, version: true,
} as const satisfies Prisma.ServiceSelect;
const professionalSelect = {
  id: true, locationId: true, userId: true, name: true, bio: true, active: true, version: true,
} as const satisfies Prisma.ProfessionalSelect;
const orderBy = [{ name: 'asc' }, { id: 'asc' }] as const;

type ServiceRecord = Prisma.ServiceGetPayload<{ select: typeof serviceSelect }>;
type ProfessionalRecord = Prisma.ProfessionalGetPayload<{ select: typeof professionalSelect }>;

function serviceItem(record: ServiceRecord): CatalogServiceItem {
  return { ...record, version: record.version };
}
function professionalItem(record: ProfessionalRecord, serviceIds: string[]): CatalogProfessional {
  return { ...record, serviceIds: [...serviceIds].sort(), version: record.version };
}
async function requireActiveLocation(tx: Prisma.TransactionClient, tenantId: string, id: string): Promise<void> {
  const location = await tx.location.findFirst({ where: { tenantId, id, active: true }, select: { id: true } });
  if (!location) throw new AccessError('NOT_FOUND');
}
async function requireServices(tx: Prisma.TransactionClient, tenantId: string, locationId: string, serviceIds: string[]): Promise<void> {
  if (!serviceIds.length) return;
  const count = await tx.service.count({ where: { tenantId, locationId, id: { in: serviceIds } } });
  if (count !== serviceIds.length) throw new AccessError('NOT_FOUND');
}
async function audit(tx: Prisma.TransactionClient, context: TenantContext, resource: 'Service' | 'Professional', resourceId: string, action: string): Promise<void> {
  await tx.auditLog.create({ data: { tenantId: context.tenant.id, actorUserId: context.userId, action, resource, resourceId } });
}

/** Every operation receives the authenticated context assembled by the server. */
export class CatalogService {
  constructor(private readonly db: PrismaClient) {}

  async listServices(context: TenantContext): Promise<ServiceCatalog> {
    requirePermission(context, 'services.manage');
    const tenantId = context.tenant.id;
    const [items, locations] = await Promise.all([
      this.db.service.findMany({ where: { tenantId }, select: serviceSelect, orderBy: [...orderBy] }),
      this.db.location.findMany({ where: { tenantId }, select: locationSelect, orderBy: [...orderBy] }),
    ]);
    return { items: items.map(serviceItem), locations };
  }

  async listProfessionals(context: TenantContext): Promise<ProfessionalCatalog> {
    requirePermission(context, 'professionals.manage');
    const tenantId = context.tenant.id;
    const [items, locations, services] = await Promise.all([
      this.db.professional.findMany({
        where: { tenantId },
        select: { ...professionalSelect, services: { where: { tenantId }, select: { serviceId: true } } },
        orderBy: [...orderBy],
      }),
      this.db.location.findMany({ where: { tenantId }, select: locationSelect, orderBy: [...orderBy] }),
      this.db.service.findMany({ where: { tenantId }, select: { id: true, locationId: true, name: true, active: true }, orderBy: [...orderBy] }),
    ]);
    return {
      items: items.map(({ services: links, ...record }) => professionalItem(record, links.map(link => link.serviceId))),
      locations,
      services,
    };
  }

  async createService(context: TenantContext, input: unknown): Promise<CatalogServiceItem> {
    requirePermission(context, 'services.manage');
    const fields = createServiceSchema.parse(input);
    const tenantId = context.tenant.id;
    return this.db.$transaction(async tx => {
      await requireActiveLocation(tx, tenantId, fields.locationId);
      const item = await tx.service.create({ data: { ...fields, tenantId }, select: serviceSelect });
      await audit(tx, context, 'Service', item.id, 'service.created');
      return serviceItem(item);
    });
  }

  async updateService(context: TenantContext, id: string, input: unknown): Promise<CatalogServiceItem> {
    requirePermission(context, 'services.manage');
    const resourceId = idSchema.parse(id);
    const { expectedVersion, ...fields } = updateServiceSchema.parse(input);
    const tenantId = context.tenant.id;
    return this.db.$transaction(async tx => {
      const current = await tx.service.findFirst({ where: { tenantId, id: resourceId }, select: { version: true } });
      if (!current) throw new AccessError('NOT_FOUND');
      if (current.version !== expectedVersion) throw new AccessError('CONFLICT');
      const result = await tx.service.updateMany({
        where: { tenantId, id: resourceId, version: expectedVersion },
        data: { ...fields, version: { increment: 1 } },
      });
      const item = await tx.service.findFirst({ where: { tenantId, id: resourceId }, select: serviceSelect });
      if (!item) throw new AccessError('NOT_FOUND');
      if (result.count !== 1) throw new AccessError('CONFLICT');
      await audit(tx, context, 'Service', resourceId, 'service.updated');
      return serviceItem(item);
    });
  }

  async createProfessional(context: TenantContext, input: unknown): Promise<CatalogProfessional> {
    requirePermission(context, 'professionals.manage');
    const { serviceIds, ...fields } = createProfessionalSchema.parse(input);
    const tenantId = context.tenant.id;
    return this.db.$transaction(async tx => {
      await requireActiveLocation(tx, tenantId, fields.locationId);
      await requireServices(tx, tenantId, fields.locationId, serviceIds);
      if (fields.userId && !await tx.membership.findFirst({ where: { tenantId, userId: fields.userId, status: 'ACTIVE' }, select: { id: true } })) throw new AccessError('NOT_FOUND');
      const item = await tx.professional.create({ data: { ...fields, tenantId }, select: professionalSelect });
      if (serviceIds.length) await tx.professionalService.createMany({
        data: serviceIds.map(serviceId => ({ tenantId, locationId: item.locationId, professionalId: item.id, serviceId })),
      });
      await audit(tx, context, 'Professional', item.id, 'professional.created');
      return professionalItem(item, serviceIds);
    });
  }

  async updateProfessional(context: TenantContext, id: string, input: unknown): Promise<CatalogProfessional> {
    requirePermission(context, 'professionals.manage');
    const resourceId = idSchema.parse(id);
    const { expectedVersion, serviceIds, ...fields } = updateProfessionalSchema.parse(input);
    const tenantId = context.tenant.id;
    return this.db.$transaction(async tx => {
      const current = await tx.professional.findFirst({ where: { tenantId, id: resourceId }, select: { locationId: true, version: true } });
      if (!current) throw new AccessError('NOT_FOUND');
      if (current.version !== expectedVersion) throw new AccessError('CONFLICT');
      await requireServices(tx, tenantId, current.locationId, serviceIds);
      if (fields.userId && !await tx.membership.findFirst({ where: { tenantId, userId: fields.userId, status: 'ACTIVE' }, select: { id: true } })) throw new AccessError('NOT_FOUND');
      const result = await tx.professional.updateMany({
        where: { tenantId, id: resourceId, version: expectedVersion },
        data: { ...fields, version: { increment: 1 } },
      });
      const item = await tx.professional.findFirst({ where: { tenantId, id: resourceId }, select: professionalSelect });
      if (!item) throw new AccessError('NOT_FOUND');
      if (result.count !== 1) throw new AccessError('CONFLICT');
      await tx.professionalService.deleteMany({ where: { tenantId, locationId: current.locationId, professionalId: resourceId } });
      if (serviceIds.length) await tx.professionalService.createMany({
        data: serviceIds.map(serviceId => ({ tenantId, locationId: current.locationId, professionalId: resourceId, serviceId })),
      });
      await audit(tx, context, 'Professional', resourceId, 'professional.updated');
      return professionalItem(item, serviceIds);
    });
  }
}
