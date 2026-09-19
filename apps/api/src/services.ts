import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { PlatformAuth } from '@platform/auth';
import type { PlatformConfig } from '@platform/config';
import type { PrismaClient } from '@platform/database';
import { FeatureEngine, prismaFeatureSource } from '@platform/billing';
import { prismaTenantDirectory, resolvePublicTenant, normalizeHostname, resolveAuthenticatedTenant, requirePermission, TenantSiteRepository, TenantContextStore } from '@platform/tenancy';
import { AccessError, featureKeys, type TenantContext, type PermissionKey, type FeatureKey } from '@platform/types';
import type { PublicSiteData } from '@platform/theme-engine';
import { resolvePublicTheme } from '@platform/themes';
import { z } from 'zod';
import { designTokenOverridesSchema } from '@platform/design-system';
import { CatalogService } from './catalog';
import { BookingService } from './booking';
import { OnboardingService } from './onboarding';
import { LocationService } from './locations';
import { AdminService } from './admin';
import { SiteEditorService } from './site-editor';
import { siteContentSchema, siteCodeSchema } from '@platform/theme-engine';

import { FinanceService } from './finance';

const addressSchema = z.object({ street: z.string().optional(), address: z.string().optional(), city: z.string().default(''), state: z.string().default(''), mapUrl: z.string().optional() });
const publishedConfigSchema = z.object({ tokens: designTokenOverridesSchema.optional(), content: siteContentSchema.optional(), code: siteCodeSchema.optional() });
export class FoundationServices {
  readonly directory;
  readonly features;
  readonly catalog: CatalogService;
  readonly booking: BookingService;
  readonly onboarding: OnboardingService;
  readonly locations: LocationService;
  readonly finance: FinanceService;
  readonly contexts = new TenantContextStore();
  constructor(readonly db: PrismaClient, readonly auth: PlatformAuth, readonly config: PlatformConfig) {
    this.directory = prismaTenantDirectory(db);
    this.features = new FeatureEngine(prismaFeatureSource(db));
    this.catalog = new CatalogService(db);
    this.booking = new BookingService(db);
    this.onboarding = new OnboardingService(db);
    this.locations = new LocationService(db);
    this.finance = new FinanceService(db);
  }
  async session(request: FastifyRequest) {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session || !session.user.emailVerified) throw new AccessError('UNAUTHENTICATED');
    return session;
  }
  async authorize(request: FastifyRequest, slug: string, permission?: PermissionKey, feature?: FeatureKey): Promise<TenantContext> {
    const { user } = await this.session(request);
    const context = await resolveAuthenticatedTenant(user.id, slug, this.directory);
    if (permission) requirePermission(context, permission);
    if (feature) await this.features.require(context.tenant.id, feature);
    return context;
  }
  async me(request: FastifyRequest) {
    const { user } = await this.session(request);
    const records = await this.db.membership.findMany({ where: { userId: user.id, status: 'ACTIVE', tenant: { status: 'ACTIVE' } }, select: { id: true, role: { select: { key: true } }, tenant: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'asc' } });
    return { user: { id: user.id, name: user.name, email: user.email }, memberships: records.map(record => ({ ...record, role: record.role.key })) };
  }
  async site(context: TenantContext, id?: string) {
    return this.contexts.run(context, async () => {
      const site = id ? await new TenantSiteRepository(this.db, this.contexts.get()).findSite(id) : await this.db.siteConfiguration.findFirst({ where: { tenantId: context.tenant.id }, select: { id: true, title: true, description: true, themeId: true } });
      if (!site) throw new AccessError('NOT_FOUND');
      return site;
    });
  }
  async setupStatus(context: TenantContext) {
    const [locationsCount, activeServicesCount, activeProfessionals] = await Promise.all([
      this.db.location.count({ where: { tenantId: context.tenant.id } }),
      this.db.service.count({ where: { tenantId: context.tenant.id, active: true } }),
      this.db.professional.findMany({ where: { tenantId: context.tenant.id, active: true, location: { active: true } }, select: { name: true }, take: 2 })
    ]);
    return {
      locationsCount,
      hasActiveServices: activeServicesCount > 0,
      activeProfessionalsCount: activeProfessionals.length,
      soloProfessionalName: activeProfessionals.length === 1 ? activeProfessionals[0]!.name : null,
    };
  }
  async entitlements(context: TenantContext) {
    return Promise.all(featureKeys.map(async key => ({ key, ...await this.features.access(context.tenant.id, key) })));
  }
  async getDesignConfig(context: TenantContext) {
    return this.contexts.run(context, async () => {
      let config = await this.db.tenantDesignConfig.findUnique({ where: { tenantId: context.tenant.id } });
      if (!config) {
        config = await this.db.tenantDesignConfig.create({ data: { tenantId: context.tenant.id } });
      }
      return config;
    });
  }
  async domains(context: TenantContext) { return new TenantSiteRepository(this.db, context).listDomains(); }
  async requireSuperAdmin(request: FastifyRequest) {
    const session = await this.session(request);
    const user = await this.db.user.findUnique({ where: { id: session.user.id }, select: { platformRole: true } });
    if (user?.platformRole !== 'SUPER_ADMIN') throw new AccessError('FORBIDDEN');
    return session;
  }
  private adminWrite(request: FastifyRequest) {
    z.object({}).strict().parse(request.query);
    if (!request.headers.origin || !this.config.TRUSTED_ORIGINS.includes(request.headers.origin)) throw new AccessError('FORBIDDEN');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new AccessError('INVALID_INPUT');
  }
  async adminStats(request: FastifyRequest) {
    await this.requireSuperAdmin(request);
    z.object({}).strict().parse(request.query);
    const [tenants, users, subscriptions, totalTenants, suspendedTenants, verifiedUsers] = await Promise.all([
      this.db.tenant.count({ where: { status: 'ACTIVE' } }), this.db.user.count(),
      this.db.subscription.count({ where: { status: 'ACTIVE' } }), this.db.tenant.count(),
      this.db.tenant.count({ where: { status: 'SUSPENDED' } }), this.db.user.count({ where: { emailVerified: true } }),
    ]);
    return { tenants, users, subscriptions, totalTenants, suspendedTenants, verifiedUsers };
  }
  async adminTenants(request: FastifyRequest) {
    await this.requireSuperAdmin(request);
    return new AdminService(this.db).tenants(request.query);
  }
  async adminUsers(request: FastifyRequest) {
    await this.requireSuperAdmin(request);
    return new AdminService(this.db).users(request.query);
  }
  async adminPlans(request: FastifyRequest) {
    await this.requireSuperAdmin(request);
    z.object({}).strict().parse(request.query);
    return this.db.plan.findMany({ orderBy: [{ monthlyPriceCents: 'asc' }, { id: 'asc' }], select: { id: true, key: true, name: true, description: true, active: true, monthlyPriceCents: true, setupFeeCents: true, customDesignFeeCents: true } });
  }
  async adminCreateUser(request: FastifyRequest, body: unknown) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).createUser(session.user.id, body);
  }
  async adminCreatePlan(request: FastifyRequest, body: unknown) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).createPlan(session.user.id, body);
  }
  async adminUpdatePlan(request: FastifyRequest, id: string, body: unknown) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).updatePlan(session.user.id, id, body);
  }
  async adminDeletePlan(request: FastifyRequest, id: string) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).deletePlan(session.user.id, id);
  }
  async adminCreateTenant(request: FastifyRequest, body: unknown) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).create(session.user.id, body);
  }
  async adminTenant(request: FastifyRequest, id: string) {
    await this.requireSuperAdmin(request);
    z.object({}).strict().parse(request.query);
    return new AdminService(this.db).detail(id);
  }
  async adminLocation(request: FastifyRequest, id: string, locationId: string | undefined, body: unknown) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).location(session.user.id, id, locationId, body);
  }
  async adminUpdateTenant(request: FastifyRequest, id: string, body: unknown) {
    const session = await this.requireSuperAdmin(request);
    this.adminWrite(request);
    return new AdminService(this.db).update(session.user.id, id, body);
  }
  async adminSiteEditor(request: FastifyRequest, id: string, operation: 'read' | 'save' | 'transition', body?: unknown) {
    const session = await this.requireSuperAdmin(request);
    const editor = new SiteEditorService(this.db);
    if (operation === 'read') { z.object({}).strict().parse(request.query); return editor.read(id); }
    this.adminWrite(request);
    return operation === 'save' ? editor.save(id, session.user.id, body) : editor.transition(id, session.user.id, body);
  }
  async publicSite(hostname: string) {
    const tenant = await resolvePublicTenant(hostname, this.config.PLATFORM_DOMAIN, this.directory);
    const host = normalizeHostname(hostname);
    if (!host.endsWith(`.${normalizeHostname(this.config.PLATFORM_DOMAIN)}`)) await this.features.require(tenant.id, 'custom_domain');
    await this.features.require(tenant.id, 'website');
    const site = await this.db.siteConfiguration.findFirst({ where: { tenantId: tenant.id, published: true }, include: { theme: true, publishedThemeVersion: true } });
    if (!site || !site.theme.active || !site.publishedThemeVersion || site.publishedThemeVersion.status !== 'PUBLISHED' || (site.theme.ownerTenantId && site.theme.ownerTenantId !== tenant.id)) throw new AccessError('NOT_FOUND');
    const features = (await Promise.all(featureKeys.map(async key => await this.features.hasFeature(tenant.id, key) ? key : null))).filter((key): key is FeatureKey => key !== null);
    const context = { tenantId: tenant.id, themeId: site.theme.key, allowedThemeIds: [site.theme.key], features };
    const definition = resolvePublicTheme(context);
    const [identity, location, services, professionals] = await Promise.all([
      this.db.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { phone: true, email: true, whatsapp: true } }),
      this.db.location.findFirst({ where: { tenantId: tenant.id, active: true }, orderBy: { id: 'asc' }, select: { id: true, address: true, timezone: true } }),
      this.db.service.findMany({ where: { tenantId: tenant.id, active: true, location: { active: true } }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, description: true, priceCents: true, durationMinutes: true } }),
      this.db.professional.findMany({ where: { tenantId: tenant.id, active: true, location: { active: true } }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, bio: true, services: { where: { tenantId: tenant.id }, select: { serviceId: true } } } }),
    ]);
    const address = addressSchema.parse(location?.address ?? {});
    const version = publishedConfigSchema.parse(site.publishedThemeVersion.config);
    const data: PublicSiteData = {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, description: site.description, contact: { phone: identity.phone ?? undefined, email: identity.email ?? undefined, whatsapp: identity.whatsapp ?? undefined }, location: { id: location?.id ?? '', address: address.street ?? address.address ?? '', city: address.city, state: address.state, timezone: location?.timezone ?? 'America/Sao_Paulo', mapUrl: address.mapUrl } },
      services: services.map(service => ({ id: service.id, name: service.name, description: service.description ?? undefined, durationMinutes: service.durationMinutes, priceCents: service.priceCents, priceLabel: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.priceCents / 100) })),
      professionals: professionals.map(professional => ({ id: professional.id, name: professional.name, specialty: professional.bio ?? undefined, serviceIds: professional.services.map(s => s.serviceId) })),
      tokens: version.tokens,
      content: version.content,
      code: version.code,
      whiteLabel: features.includes('white_label'),
    };
    const primaryDomain = features.includes('custom_domain') ? await this.db.domain.findFirst({ where: { tenantId: tenant.id, status: 'ACTIVE', isPrimary: true }, select: { hostname: true } }) : null;
    return { data, themeId: definition.id, themeContext: context, version: site.publishedThemeVersion.version, title: site.title, canonicalHost: primaryDomain?.hostname ?? `${tenant.slug}.${this.config.PLATFORM_DOMAIN}` };
  }
}

