import type { PrismaClient, Prisma } from '@platform/database';
import { AccessError } from '@platform/types';
import { tenantSlugSchema } from '@platform/tenancy';
import { z } from 'zod';
import { LocationOperations } from './locations';
import { CatalogOperations } from './catalog';
import { hashPassword } from 'better-auth/crypto';

const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const pagination = { q: z.string().trim().max(120).default(''), page: z.coerce.number().int().min(1).max(10000).default(1) };
const tenantQuery = z.object({ ...pagination, status: z.enum(['', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELED']).default('') }).strict();
const userQuery = z.object({ ...pagination, status: z.enum(['', 'verified', 'pending', 'admin']).default('') }).strict();
const pageSize = 25;
const tenantFields = { name: z.string().trim().min(2).max(120), slug: tenantSlugSchema, planId: identifier };
const timezone = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return true; } catch { return false; } });
const phone = z.string().trim().max(30).regex(/^[+\d\s().-]*$/).nullable();
const createInput = z.object({ ...tenantFields, ownerEmail: z.email().trim().toLowerCase().max(254), timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return true; } catch { return false; } }).default('America/Sao_Paulo') }).strict();

/** All callers must establish SUPER_ADMIN authority in FoundationServices first. */
export class AdminService {
  constructor(private readonly db: PrismaClient) {}
  async tenantActor(actorUserId: string, tenantId: string) {
    identifier.parse(tenantId);
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new AccessError('NOT_FOUND');
    return { tenant, userId: actorUserId };
  }
  async userDetail(id: string) {
    identifier.parse(id);
    const [user, tenants, roles] = await Promise.all([
      this.db.user.findUnique({ where: { id }, select: {
        id: true, name: true, email: true, emailVerified: true, platformRole: true, createdAt: true, updatedAt: true,
        memberships: { orderBy: { createdAt: 'asc' }, select: { id: true, tenantId: true, status: true, roleId: true, role: { select: { key: true, name: true } }, tenant: { select: { name: true, slug: true } } } },
        _count: { select: { sessions: true } }, accounts: { select: { providerId: true, password: true } },
      } }),
      this.db.tenant.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, status: true } }),
      this.db.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, key: true, name: true } }),
    ]);
    if (!user) throw new AccessError('NOT_FOUND');
    return { ...user, hasPassword: user.accounts.some(account => account.providerId === 'credential' && !!account.password), accounts: undefined, tenantOptions: tenants, roleOptions: roles };
  }
  async updateUser(actorUserId: string, id: string, body: unknown) {
    identifier.parse(id);
    const input = z.discriminatedUnion('action', [
      z.object({ action: z.literal('update'), name: z.string().trim().min(2).max(120), email: z.email().trim().toLowerCase().max(254), platformRole: z.enum(['USER', 'SUPER_ADMIN']), emailVerified: z.boolean(), expectedUpdatedAt: z.iso.datetime() }).strict(),
      z.object({ action: z.literal('set_password'), password: z.string().min(12).max(128) }).strict(),
      z.object({ action: z.literal('revoke_sessions') }).strict(),
      z.object({ action: z.literal('upsert_membership'), tenantId: identifier, roleId: identifier, status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']) }).strict(),
      z.object({ action: z.literal('remove_membership'), membershipId: identifier }).strict(),
    ]).parse(body);
    const target = await this.db.user.findUnique({ where: { id }, select: { id: true, email: true, platformRole: true, updatedAt: true } });
    if (!target) throw new AccessError('NOT_FOUND');
    if (input.action === 'set_password') {
      const password = await hashPassword(input.password);
      return this.db.$transaction(async tx => {
        const account = await tx.account.findFirst({ where: { userId: id, providerId: 'credential' }, select: { id: true } });
        if (account) await tx.account.update({ where: { id: account.id }, data: { password } });
        else await tx.account.create({ data: { id: crypto.randomUUID(), userId: id, providerId: 'credential', issuer: 'local:credential', accountId: id, password } });
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.user_password_set', resource: 'User', resourceId: id } });
        return { success: true };
      });
    }
    if (input.action === 'revoke_sessions') {
      return this.db.$transaction(async tx => {
        const result = await tx.session.deleteMany({ where: { userId: id } });
        await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.user_sessions_revoked', resource: 'User', resourceId: id, metadata: { count: result.count } } });
        return { success: true, revoked: result.count };
      });
    }
    if (input.action === 'update') {
      if (actorUserId === id && input.platformRole !== 'SUPER_ADMIN') throw new AccessError('CONFLICT');
      const { expectedUpdatedAt, action: _action, ...fields } = input;
      return this.db.$transaction(async tx => {
        const changed = await tx.user.updateMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) }, data: fields });
        if (changed.count !== 1) throw new AccessError('CONFLICT');
        await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.user_updated', resource: 'User', resourceId: id, metadata: { previousRole: target.platformRole, platformRole: fields.platformRole, previousEmail: target.email, email: fields.email } } });
        return { success: true };
      });
    }
    if (input.action === 'upsert_membership') {
      return this.db.$transaction(async tx => {
        const [tenant, role] = await Promise.all([tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } }), tx.role.findUnique({ where: { id: input.roleId }, select: { id: true, key: true } })]);
        if (!tenant || !role) throw new AccessError('NOT_FOUND');
        const membership = await tx.membership.upsert({ where: { tenantId_userId: { tenantId: input.tenantId, userId: id } }, create: { tenantId: input.tenantId, userId: id, roleId: input.roleId, status: input.status }, update: { roleId: input.roleId, status: input.status } });
        await tx.auditLog.create({ data: { tenantId: input.tenantId, actorUserId, action: 'admin.membership_upserted', resource: 'Membership', resourceId: membership.id, metadata: { userId: id, role: role.key, status: input.status } } });
        return { success: true };
      });
    }
    return this.db.$transaction(async tx => {
      const membership = await tx.membership.findFirst({ where: { id: input.membershipId, userId: id }, select: { id: true, tenantId: true, status: true, role: { select: { key: true } } } });
      if (!membership) throw new AccessError('NOT_FOUND');
      if (membership.status === 'ACTIVE' && membership.role.key === 'OWNER') {
        const owners = await tx.membership.count({ where: { tenantId: membership.tenantId, status: 'ACTIVE', role: { key: 'OWNER' } } });
        if (owners <= 1) throw new AccessError('CONFLICT');
      }
      await tx.membership.delete({ where: { id: membership.id } });
      await tx.auditLog.create({ data: { tenantId: membership.tenantId, actorUserId, action: 'admin.membership_removed', resource: 'Membership', resourceId: membership.id, metadata: { userId: id } } });
      return { success: true };
    });
  }
  async catalog(actorUserId: string, tenantId: string, resource: 'services' | 'professionals', operation: 'list' | 'create' | 'update', body?: unknown, resourceId?: string) {
    const actor = await this.tenantActor(actorUserId, tenantId);
    const catalog = new CatalogOperations(this.db);
    if (resource === 'services') {
      if (operation === 'list') return catalog.listServices(actor);
      if (operation === 'create') return catalog.createService(actor, body);
      return catalog.updateService(actor, identifier.parse(resourceId), body);
    }
    if (operation === 'list') return catalog.listProfessionals(actor);
    if (operation === 'create') return catalog.createProfessional(actor, body);
    return catalog.updateProfessional(actor, identifier.parse(resourceId), body);
  }
  async detail(id: string) {
    identifier.parse(id);
    const tenant = await this.db.tenant.findUnique({ where: { id }, select: {
      id: true, name: true, slug: true, status: true, planId: true, timezone: true, email: true, phone: true, whatsapp: true, updatedAt: true,
      plan: { select: { id: true, name: true, active: true } },
      siteConfiguration: { select: { published: true, publishedThemeVersionId: true } },
      locations: { orderBy: [{ active: 'desc' }, { name: 'asc' }] },
      memberships: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, role: { select: { name: true, key: true } }, user: { select: { name: true, email: true } } } },
      _count: { select: { services: true, professionals: true } },
    } });
    if (!tenant) throw new AccessError('NOT_FOUND');
    return tenant;
  }
  async location(actorUserId: string, tenantId: string, locationId: string | undefined, body: unknown) {
    identifier.parse(tenantId);
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new AccessError('NOT_FOUND');
    const operations = new LocationOperations(this.db);
    const actor = { tenant, userId: actorUserId };
    return locationId ? operations.updateLocation(actor, locationId, body) : operations.createLocation(actor, body);
  }
  async tenants(query: unknown) {
    const { q, status, page } = tenantQuery.parse(query);
    const where: Prisma.TenantWhereInput = { ...(status ? { status } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {}) };
    return this.db.$transaction(async tx => {
      const total = await tx.tenant.count({ where });
      const items = await tx.tenant.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
        id: true, name: true, slug: true, status: true, createdAt: true, plan: { select: { name: true } },
        memberships: { where: { status: 'ACTIVE', role: { key: 'OWNER' } }, take: 1, orderBy: { id: 'asc' }, select: { user: { select: { name: true, email: true } } } },
      } });
      return { items, total, page, pageSize };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async users(query: unknown) {
    const { q, status, page } = userQuery.parse(query);
    const where: Prisma.UserWhereInput = { ...(status === 'admin' ? { platformRole: 'SUPER_ADMIN' } : status ? { emailVerified: status === 'verified' } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) };
    return this.db.$transaction(async tx => {
      const total = await tx.user.count({ where });
      const items = await tx.user.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, name: true, email: true, emailVerified: true, platformRole: true, createdAt: true } });
      return { items, total, page, pageSize };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async createUser(actorUserId: string, body: unknown) {
    const input = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().max(254).email(), role: z.enum(['SUPER_ADMIN', 'USER']).default('USER'), emailVerified: z.boolean().default(false), tenantSlug: z.string().trim().max(63).optional() }).strict().parse(body);
    return this.db.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { email: input.email } });
      if (existing) throw new AccessError('CONFLICT');
      const user = await tx.user.create({ data: { id: crypto.randomUUID(), name: input.name, email: input.email, emailVerified: input.emailVerified, platformRole: input.role } });
      if (input.tenantSlug) {
        const tenant = await tx.tenant.findUnique({ where: { slug: input.tenantSlug }, select: { id: true } });
        if (!tenant) throw new AccessError('NOT_FOUND');
        const role = await tx.role.findUnique({ where: { key: 'OWNER' } });
        if (!role) throw new AccessError('FEATURE_DISABLED');
        const existingMembership = await tx.membership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } } });
        if (!existingMembership) {
          await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, roleId: role.id, status: 'ACTIVE' } });
        }
      }
      await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.user_created', resource: 'User', resourceId: user.id, metadata: { role: input.role, emailVerified: input.emailVerified, tenantSlug: input.tenantSlug ?? null } } });
      return { id: user.id, email: user.email };
    });
  }
  async createPlan(actorUserId: string, body: unknown) {
    const input = z.object({ key: identifier, name: z.string().trim().min(2).max(120), description: z.string().max(500).optional(), monthlyPriceCents: z.number().int().min(0).max(2147483647), setupFeeCents: z.number().int().min(0).max(2147483647), customDesignFeeCents: z.number().int().min(0).max(2147483647), basePlanId: identifier.optional() }).strict().parse(body);
    return this.db.$transaction(async tx => {
      const existing = await tx.plan.findUnique({ where: { key: input.key } });
      if (existing) throw new AccessError('CONFLICT');
      const base = input.basePlanId ? await tx.plan.findFirst({ where: { id: input.basePlanId, active: true }, include: { features: true } }) : null;
      if (input.basePlanId && (!base || !base.features.some(feature => feature.enabled))) throw new AccessError('INVALID_INPUT');
      const plan = await tx.plan.create({ data: { key: input.key, name: input.name, description: input.description, monthlyPriceCents: input.monthlyPriceCents, setupFeeCents: input.setupFeeCents, customDesignFeeCents: input.customDesignFeeCents, active: !!base } });
      if (base) await tx.planFeature.createMany({ data: base.features.map(feature => ({ planId: plan.id, featureId: feature.featureId, enabled: feature.enabled, limit: feature.limit })) });
      await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.plan_created', resource: 'Plan', resourceId: plan.id } });
      return { id: plan.id, key: plan.key };
    });
  }
  async create(actorUserId: string, body: unknown) {
    const data = createInput.parse(body);
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`onboarding-slug:${data.slug}`}, 0))`;
      if (await tx.tenant.findUnique({ where: { slug: data.slug } })) throw new AccessError('CONFLICT');
      const plan = await tx.plan.findFirst({ where: { id: data.planId, active: true } });
      if (!plan) throw new AccessError('INVALID_INPUT');
      const owner = await tx.user.findUnique({ where: { email: data.ownerEmail }, select: { id: true, emailVerified: true } });
      if (!owner?.emailVerified) throw new AccessError('NOT_FOUND');
      const role = await tx.role.findUnique({ where: { key: 'OWNER' } });
      if (!role) throw new AccessError('FEATURE_DISABLED');
      const tenant = await tx.tenant.create({ data: { name: data.name, slug: data.slug, planId: data.planId, timezone: data.timezone, status: 'ACTIVE' } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: owner.id, roleId: role.id, status: 'ACTIVE' } });
      await tx.location.create({ data: { tenantId: tenant.id, name: 'Unidade principal', slug: 'principal', timezone: data.timezone } });
      await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId, action: 'admin.tenant_created', resource: 'Tenant', resourceId: tenant.id } });
      return { id: tenant.id, slug: tenant.slug };
    });
  }
  async update(actorUserId: string, id: string, body: unknown) {
    identifier.parse(id);
    const data = z.object({ name: tenantFields.name.optional(), email: z.email().max(254).nullable().optional(), phone: phone.optional(), whatsapp: phone.optional(), timezone: timezone.optional(), status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELED']), planId: identifier, expectedUpdatedAt: z.iso.datetime() }).strict().parse(body);
    return this.db.$transaction(async tx => {
      const current = await tx.tenant.findUnique({ where: { id } });
      if (!current) throw new AccessError('NOT_FOUND');
      if (current.planId !== data.planId && !await tx.plan.findFirst({ where: { id: data.planId, active: true } })) throw new AccessError('INVALID_INPUT');
      const { expectedUpdatedAt, ...fields } = data;
      const changed = await tx.tenant.updateMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) }, data: { ...fields, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) } });
      if (changed.count !== 1) throw new AccessError('CONFLICT');
      await tx.auditLog.create({ data: { tenantId: id, actorUserId, action: 'admin.tenant_updated', resource: 'Tenant', resourceId: id, metadata: { previousStatus: current.status, status: data.status, previousPlanId: current.planId, planId: data.planId } } });
      return { success: true };
    });
  }
  async updatePlan(actorUserId: string, id: string, body: unknown) {
    identifier.parse(id);
    const { action, ...data } = z.object({ action: z.string().optional(), name: z.string().trim().min(2).max(120).optional(), description: z.string().max(500).nullable().optional(), monthlyPriceCents: z.number().int().min(0).max(2147483647).optional(), setupFeeCents: z.number().int().min(0).max(2147483647).optional(), customDesignFeeCents: z.number().int().min(0).max(2147483647).optional(), active: z.boolean().optional() }).strict().parse(body);
    return this.db.$transaction(async tx => {
      const current = await tx.plan.findUnique({ where: { id } });
      if (!current) throw new AccessError('NOT_FOUND');
      if (action === 'delete') {
        const tenant = await tx.tenant.findFirst({ where: { planId: id } });
        if (tenant) throw new AccessError('CONFLICT');
        await tx.plan.delete({ where: { id } });
        return { id };
      }
      await tx.plan.update({ where: { id }, data });
      await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.plan_updated', resource: 'Plan', resourceId: id, metadata: { previousActive: current.active, ...data } } });
      return { success: true };
    });
  }
  async deletePlan(actorUserId: string, id: string) {
    identifier.parse(id);
    return this.db.$transaction(async tx => {
      const current = await tx.plan.findUnique({ where: { id } });
      if (!current) throw new AccessError('NOT_FOUND');
      const tenantCount = await tx.tenant.count({ where: { planId: id } });
      const subscriptionCount = await tx.subscription.count({ where: { planId: id } });
      if (tenantCount > 0 || subscriptionCount > 0) throw new AccessError('CONFLICT');
      await tx.planFeature.deleteMany({ where: { planId: id } });
      await tx.plan.delete({ where: { id } });
      await tx.auditLog.create({ data: { tenantId: null, actorUserId, action: 'admin.plan_deleted', resource: 'Plan', resourceId: id, metadata: { key: current.key, name: current.name } } });
      return { success: true };
    });
  }
}
