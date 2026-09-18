import type { PrismaClient, Prisma } from '@platform/database';
import { requirePermission } from '@platform/tenancy';
import { AccessError, type TenantContext } from '@platform/types';
import { FeatureEngine, prismaFeatureSource } from '@platform/billing';
import { z } from 'zod';

const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const nameSchema = z.string().trim().min(1).max(120);
const versionSchema = z.number().int().positive();
const addressSchema = z.object({
  street: z.string().max(200).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
}).strict().default({});

const locationFields = {
  name: nameSchema,
  phone: z.string().max(30).nullable().optional(),
  address: addressSchema,
  active: z.boolean(),
};

const createLocationSchema = z.object({
  ...locationFields,
  slug: idSchema.optional(),
}).strict();

const updateLocationSchema = z.object({
  ...locationFields,
  expectedVersion: versionSchema,
}).strict();

type LocationActor = { tenant: { id: string }; userId: string };

/** Shared operations: callers establish membership authority or SUPER_ADMIN before invoking. */
export class LocationOperations {
  constructor(private readonly db: PrismaClient) {}
  private async lock(tx: Prisma.TransactionClient, tenantId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`locations:${tenantId}`}, 0))`;
  }
  private async capacity(tx: Prisma.TransactionClient, tenantId: string) {
    const count = await tx.location.count({ where: { tenantId, active: true } });
    if (!count) return;
    const grant = await new FeatureEngine(prismaFeatureSource(tx)).access(tenantId, 'multi_location');
    if (!grant.enabled || grant.limit !== null && count >= grant.limit) throw new AccessError('FEATURE_DISABLED');
  }

  async listLocations(context: LocationActor) {
    
    const locations = await this.db.location.findMany({
      where: { tenantId: context.tenant.id },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    return { locations };
  }

  async createLocation(context: LocationActor, data: unknown) {
    const input = createLocationSchema.parse(data);

    return this.db.$transaction(async (tx) => {
      await this.lock(tx, context.tenant.id);
      if (input.active) await this.capacity(tx, context.tenant.id);
      // Basic slug generator if missing
      const slug = idSchema.parse(input.slug || input.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
      
      const existingSlug = await tx.location.findUnique({
        where: { tenantId_slug: { tenantId: context.tenant.id, slug } }
      });
      if (existingSlug) {
        throw new AccessError('CONFLICT'); // Duplicate slug
      }

      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: context.tenant.id }, select: { timezone: true } });
      const location = await tx.location.create({
        data: {
          tenantId: context.tenant.id,
          name: input.name,
          slug,
          address: input.address,
          phone: input.phone || null,
          active: input.active,
          timezone: tenant.timezone,
        }
      });

      await tx.auditLog.create({ data: { tenantId: context.tenant.id, actorUserId: context.userId, action: 'location.created', resource: 'Location', resourceId: location.id } });
      return location;
    });
  }

  async updateLocation(context: LocationActor, id: string, data: unknown) {
    const input = updateLocationSchema.parse(data);
    idSchema.parse(id);

    return this.db.$transaction(async (tx) => {
      await this.lock(tx, context.tenant.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:${context.tenant.id}:${id}`}, 0))`;
      const location = await tx.location.findUnique({
        where: { tenantId_id: { tenantId: context.tenant.id, id } }
      });

      if (!location) throw new AccessError('NOT_FOUND');
      if (location.version !== input.expectedVersion) throw new AccessError('CONFLICT');

      // Check multi-location entitlement if re-activating a location
      if (!location.active && input.active) {
        await this.capacity(tx, context.tenant.id);
      }
      if (location.active && !input.active && await tx.appointment.count({ where: { tenantId: context.tenant.id, locationId: id, endsAt: { gt: new Date() }, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] } } })) throw new AccessError('CONFLICT');

      const updated = await tx.location.update({
        where: { tenantId_id: { tenantId: context.tenant.id, id } },
        data: {
          name: input.name,
          address: input.address,
          phone: input.phone || null,
          active: input.active,
          version: { increment: 1 },
        }
      });

      await tx.auditLog.create({ data: { tenantId: context.tenant.id, actorUserId: context.userId, action: 'location.updated', resource: 'Location', resourceId: id } });
      return updated;
    });
  }
}

export class LocationService extends LocationOperations {
  override async listLocations(context: TenantContext) {
    requirePermission(context, 'team.manage');
    return super.listLocations(context);
  }
  override async createLocation(context: TenantContext, data: unknown) {
    requirePermission(context, 'team.manage');
    return super.createLocation(context, data);
  }
  override async updateLocation(context: TenantContext, id: string, data: unknown) {
    requirePermission(context, 'team.manage');
    return super.updateLocation(context, id, data);
  }
}
