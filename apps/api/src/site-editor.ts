import { z } from 'zod';
import type { PrismaClient, Prisma } from '@platform/database';
import { AccessError, featureKeys } from '@platform/types';
import { FeatureEngine, prismaFeatureSource } from '@platform/billing';
import { siteEditorConfigSchema, type PublicSiteData, type SiteEditorConfig } from '@platform/theme-engine';
import { themeRegistry } from '@platform/themes';

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const saveSchema = z.object({ expectedVersionId: idSchema.nullable(), themeId: idSchema, config: siteEditorConfigSchema }).strict();
const actionSchema = z.object({ action: z.enum(['approve', 'publish', 'rollback']), versionId: idSchema, expectedPublishedId: idSchema.nullable() }).strict();
const latestOrder = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
type Database = PrismaClient | Prisma.TransactionClient;

/** Entrypoints are authenticated by FoundationServices; all records remain explicitly tenant-scoped. */
export class SiteEditorService {
  constructor(private readonly db: PrismaClient) {}
  private async enabled(db: Database, tenantId: string) {
    idSchema.parse(tenantId);
    if (!await db.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })) throw new AccessError('NOT_FOUND');
    await new FeatureEngine(prismaFeatureSource(db)).require(tenantId, 'website');
  }
  private async theme(db: Database, tenantId: string, id: string) {
    const theme = await db.theme.findFirst({ where: { id, active: true, OR: [{ ownerTenantId: null }, { ownerTenantId: tenantId }] } });
    const renderer = theme && themeRegistry.get(theme.key);
    if (!theme || !renderer || !['classic', 'urban', 'bespoke-imperial'].includes(theme.key) || renderer.allowedTenantIds && !renderer.allowedTenantIds.includes(tenantId)) throw new AccessError('INVALID_INPUT');
    const engine = new FeatureEngine(prismaFeatureSource(db));
    for (const key of renderer.requiredFeatures) {
      // Templates in the reviewed editor registry currently declare no additional features.
      const feature = featureKeys.find(item => item === key);
      if (!feature || !(await engine.hasFeature(tenantId, feature))) throw new AccessError('FEATURE_DISABLED');
    }
    return theme;
  }
  async read(tenantId: string) {
    await this.enabled(this.db, tenantId);
    const [tenant, site, versions, themes] = await Promise.all([
      this.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { locations: { where: { active: true }, take: 1, orderBy: { id: 'asc' } }, services: { where: { active: true, location: { active: true } }, take: 100 }, professionals: { where: { active: true, location: { active: true } }, take: 100 } } }),
      this.db.siteConfiguration.findUnique({ where: { tenantId } }),
      this.db.themeVersion.findMany({ where: { tenantId }, orderBy: latestOrder, take: 20, include: { theme: { select: { key: true, name: true } } } }),
      this.db.theme.findMany({ where: { active: true, OR: [{ ownerTenantId: null }, { ownerTenantId: tenantId }], key: { in: ['classic', 'urban', 'bespoke-imperial'] } }, orderBy: { key: 'asc' }, select: { id: true, key: true, name: true } }),
    ]);
    const latest = versions[0];
    for (let i = themes.length - 1; i >= 0; i--) { try { await this.theme(this.db, tenantId, themes[i]!.id); } catch { themes.splice(i, 1); } }
    const parsed = siteEditorConfigSchema.safeParse(latest?.config);
    const config: SiteEditorConfig = parsed.success ? parsed.data : { tokens: {}, content: { title: site?.title ?? tenant.name, description: site?.description ?? '', heroTitle: site?.heroTitle || tenant.name, heroSubtitle: site?.heroSubtitle || site?.description || '', sections: [{ id: 'about', type: 'text', title: 'Nossa barbearia', body: '', visible: true }, { id: 'services', type: 'services', title: 'Serviços', body: '', visible: true }, { id: 'contact', type: 'contact', title: 'Visite-nos', body: '', visible: true }] } };
    const location = tenant.locations[0];
    const address = z.object({ street: z.string().optional(), address: z.string().optional(), city: z.string().optional(), state: z.string().optional(), mapUrl: z.string().optional() }).parse(location?.address ?? {});
    const engine = new FeatureEngine(prismaFeatureSource(this.db));
    const whiteLabel = await engine.hasFeature(tenantId, 'white_label');
    const data: PublicSiteData = { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, description: config.content.description, contact: { phone: tenant.phone ?? undefined, email: tenant.email ?? undefined, whatsapp: tenant.whatsapp ?? undefined }, location: { id: location?.id ?? '', address: address.street ?? address.address ?? '', city: address.city ?? '', state: address.state ?? '', timezone: location?.timezone ?? 'America/Sao_Paulo', mapUrl: address.mapUrl } }, services: tenant.services.map(item => ({ id: item.id, name: item.name, description: item.description ?? undefined, durationMinutes: item.durationMinutes, priceLabel: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.priceCents / 100) })), professionals: tenant.professionals.map(item => ({ id: item.id, name: item.name, specialty: item.bio ?? undefined }) ), whiteLabel };
    return { config, themeId: themes.some(theme => theme.id === latest?.themeId) ? latest!.themeId : themes[0]?.id ?? '', latestId: latest?.id ?? null, status: parsed.success ? latest?.status : null, publishedId: site?.publishedThemeVersionId ?? null, themes, data, history: versions.filter(version => siteEditorConfigSchema.safeParse(version.config).success).map(version => ({ id: version.id, number: version.version, themeName: version.theme.name, status: version.status, createdAt: version.createdAt })) };
  }
  async save(tenantId: string, actor: string, body: unknown) {
    const input = saveSchema.parse(body);
    return this.db.$transaction(async tx => {
      await this.enabled(tx, tenantId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`site-editor:${tenantId}`}, 0))`;
      const current = await tx.themeVersion.findFirst({ where: { tenantId }, orderBy: latestOrder });
      if ((current?.id ?? null) !== input.expectedVersionId) throw new AccessError('CONFLICT');
      await this.theme(tx, tenantId, input.themeId);
      const max = await tx.themeVersion.aggregate({ where: { tenantId, themeId: input.themeId }, _max: { version: true } });
      const version = await tx.themeVersion.create({ data: { tenantId, themeId: input.themeId, version: (max._max.version ?? 0) + 1, config: input.config, status: 'DRAFT' } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: actor, action: 'site.draft_saved', resource: 'ThemeVersion', resourceId: version.id } });
      return { id: version.id };
    });
  }
  async transition(tenantId: string, actor: string, body: unknown) {
    const input = actionSchema.parse(body);
    return this.db.$transaction(async tx => {
      await this.enabled(tx, tenantId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`site-editor:${tenantId}`}, 0))`;
      const version = await tx.themeVersion.findFirst({ where: { tenantId, id: input.versionId } });
      if (!version) throw new AccessError('NOT_FOUND');
      const theme = await this.theme(tx, tenantId, version.themeId);
      const config = siteEditorConfigSchema.parse(version.config);
      const latest = await tx.themeVersion.findFirst({ where: { tenantId }, orderBy: latestOrder });
      const site = await tx.siteConfiguration.findUnique({ where: { tenantId } });
      if ((site?.publishedThemeVersionId ?? null) !== input.expectedPublishedId) throw new AccessError('CONFLICT');
      if (input.action === 'rollback') {
        if (version.status !== 'PUBLISHED' || !version.publishedAt || version.id === site?.publishedThemeVersionId) throw new AccessError('CONFLICT');
      } else if (latest?.id !== version.id || version.status !== (input.action === 'approve' ? 'DRAFT' : 'APPROVED')) throw new AccessError('CONFLICT');
      if (input.action === 'approve') {
        await tx.themeVersion.update({ where: { id: version.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
      } else {
        if (input.action === 'publish') await tx.themeVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
        const fields = { themeId: theme.id, publishedThemeVersionId: version.id, published: true, title: config.content.title, description: config.content.description, heroTitle: config.content.heroTitle, heroSubtitle: config.content.heroSubtitle };
        await tx.siteConfiguration.upsert({ where: { tenantId }, create: { tenantId, ...fields }, update: fields });
      }
      await tx.auditLog.create({ data: { tenantId, actorUserId: actor, action: `site.${input.action}`, resource: 'ThemeVersion', resourceId: version.id } });
      return { success: true };
    });
  }
}
