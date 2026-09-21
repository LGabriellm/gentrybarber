import { z } from 'zod';
import type { PrismaClient } from '@platform/database';
import { AccessError } from '@platform/types';
import { tenantSlugSchema } from '@platform/tenancy';

const onboardingSchema = z.object({
  tenantName: z.string().trim().min(2).max(64),
  tenantSlug: tenantSlugSchema,
  locationName: z.string().trim().min(2).max(64),
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return true; } catch { return false; } }).default('America/Sao_Paulo'),
  address: z.object({
    street: z.string().max(200).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
  }).strict().default({}),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
}).strict();

export class OnboardingService {
  constructor(private readonly db: PrismaClient) {}

  async onboard(userId: string, data: unknown) {
    const input = onboardingSchema.parse(data);

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding:${userId}`}, 0))`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { emailVerified: true, platformRole: true } });
      if (!user?.emailVerified || user.platformRole === 'SUPER_ADMIN' || await tx.membership.count({ where: { userId, status: 'ACTIVE' } })) throw new AccessError('FORBIDDEN');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding-slug:${input.tenantSlug}`}, 0))`;
      // 1. Verify if slug is already taken
      const existing = await tx.tenant.findUnique({ where: { slug: input.tenantSlug } });
      if (existing) {
        throw new AccessError('CONFLICT');
      }

      // 2. Determine default plan and role
      const setting = await tx.systemSetting.findUnique({ where: { key: 'onboarding.defaults' } });
      const defaults = z.object({ planId: z.string().min(1) }).strict().safeParse(setting?.value);
      if (!defaults.success) throw new AccessError('FEATURE_DISABLED');
      const startPlan = await tx.plan.findFirst({ where: { id: defaults.data.planId, active: true } });
      if (!startPlan) {
        throw new AccessError('FEATURE_DISABLED');
      }

      const ownerRole = await tx.role.findUnique({ where: { key: 'OWNER' } });
      if (!ownerRole) {
        throw new Error('Owner role not found');
      }

      // 3. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName,
          slug: input.tenantSlug,
          status: 'ACTIVE',
          planId: startPlan.id,
          timezone: input.timezone,
          phone: input.phone,
        }
      });

      // 4. Create Membership
      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: userId,
          roleId: ownerRole.id,
          status: 'ACTIVE',
        }
      });

      // 5. Create primary Location
      const location = await tx.location.create({
        data: {
          tenantId: tenant.id,
          name: input.locationName,
          slug: 'principal',
          timezone: input.timezone,
          address: input.address,
          phone: input.phone,
          active: true,
        }
      });

      await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId: userId, action: 'tenant.onboarded', resource: 'Tenant', resourceId: tenant.id } });
      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        locationId: location.id,
      };
    });
  }
}

