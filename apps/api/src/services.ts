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

const addressSchema = z.object({ street: z.string().optional(), address: z.string().optional(), city: z.string().default(''), state: z.string().default('') });
const publishedConfigSchema = z.object({ tokens: designTokenOverridesSchema.optional() });
export class FoundationServices {
  readonly directory;
  readonly features;
  readonly catalog: CatalogService;
  readonly booking: BookingService;
  readonly onboarding: OnboardingService;
  readonly locations: LocationService;
  readonly contexts = new TenantContextStore();
  constructor(readonly db: PrismaClient, readonly auth: PlatformAuth, readonly config: PlatformConfig) {
    this.directory = prismaTenantDirectory(db);
    this.features = new FeatureEngine(prismaFeatureSource(db));
    this.catalog = new CatalogService(db);
    this.booking = new BookingService(db);
    this.onboarding = new OnboardingService(db);
    this.locations = new LocationService(db);
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
  async entitlements(context: TenantContext) {
    return Promise.all(featureKeys.map(async key => ({ key, ...await this.features.access(context.tenant.id, key) })));
  }
  async domains(context: TenantContext) { return new TenantSiteRepository(this.db, context).listDomains(); }
  async adminTenants(request: FastifyRequest) {
    const session = await this.session(request);
    const user = await this.db.user.findUnique({ where: { id: session.user.id }, select: { platformRole: true } });
    if (user?.platformRole !== 'SUPER_ADMIN') throw new AccessError('FORBIDDEN');
    return this.db.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, slug: true, status: true, plan: { select: { name: true } } } });
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
      this.db.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { phone: true, email: true } }),
      this.db.location.findFirst({ where: { tenantId: tenant.id, active: true }, orderBy: { id: 'asc' }, select: { id: true, address: true } }),
      this.db.service.findMany({ where: { tenantId: tenant.id, active: true, location: { active: true } }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, description: true, priceCents: true, durationMinutes: true } }),
      this.db.professional.findMany({ where: { tenantId: tenant.id, active: true, location: { active: true } }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, bio: true } }),
    ]);
    const address = addressSchema.parse(location?.address ?? {});
    const version = publishedConfigSchema.parse(site.publishedThemeVersion.config);
    const data: PublicSiteData = {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, description: site.description, contact: { phone: identity.phone ?? undefined, email: identity.email ?? undefined }, location: { id: location?.id ?? '', address: address.street ?? address.address ?? '', city: address.city, state: address.state } },
      services: services.map(service => ({ id: service.id, name: service.name, description: service.description ?? undefined, durationMinutes: service.durationMinutes, priceLabel: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.priceCents / 100) })),
      professionals: professionals.map(professional => ({ id: professional.id, name: professional.name, specialty: professional.bio ?? undefined })),
      tokens: version.tokens,
    };
    const primaryDomain = features.includes('custom_domain') ? await this.db.domain.findFirst({ where: { tenantId: tenant.id, status: 'ACTIVE', isPrimary: true }, select: { hostname: true } }) : null;
    return { data, themeId: definition.id, themeContext: context, version: site.publishedThemeVersion.version, title: site.title, canonicalHost: primaryDomain?.hostname ?? `${tenant.slug}.${this.config.PLATFORM_DOMAIN}` };
  }
}
