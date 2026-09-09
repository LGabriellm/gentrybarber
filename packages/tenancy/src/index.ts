import { AsyncLocalStorage } from 'node:async_hooks';
import { domainToASCII } from 'node:url';
import { z } from 'zod';
import type { PrismaClient } from '@platform/database';
import { AccessError, type TenantContext, type TenantIdentity, type PermissionKey } from '@platform/types';

export const reservedSlugs = new Set(['www', 'api', 'admin', 'app', 'dashboard', 'status', 'support', 'cdn', 'assets', 'mail', 'preview']);
export const tenantSlugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/).refine(value => !reservedSlugs.has(value), 'Reserved subdomain');
export function normalizeHostname(input: string): string {
  if (!input || /[\s/@\\?#,%]/.test(input)) throw new AccessError('INVALID_INPUT');
  const match = /^(?<hostname>[^:]+)(?::(?<port>\d{1,5}))?$/.exec(input);
  if (match?.groups?.port && (Number(match.groups.port) < 1 || Number(match.groups.port) > 65535)) throw new AccessError('INVALID_INPUT');
  const host = domainToASCII(match?.groups?.hostname?.replace(/\.$/, '').toLowerCase() ?? '');
  if (!host || host.length > 253 || host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) throw new AccessError('INVALID_INPUT');
  return host;
}
export interface TenantDirectory {
  bySlug(slug: string): Promise<TenantIdentity | null>;
  byDomain(hostname: string): Promise<TenantIdentity | null>;
}
export async function resolvePublicTenant(hostname: string, platformDomain: string, directory: TenantDirectory): Promise<TenantIdentity> {
  const host = normalizeHostname(hostname);
  const base = normalizeHostname(platformDomain);
  let tenant: TenantIdentity | null = null;
  if (host.endsWith(`.${base}`)) {
    const slug = host.slice(0, -(base.length + 1));
    if (tenantSlugSchema.safeParse(slug).success) tenant = await directory.bySlug(slug);
  } else if (host !== base) tenant = await directory.byDomain(host);
  if (!tenant || tenant.status !== 'ACTIVE') throw new AccessError('NOT_FOUND');
  return Object.freeze({ ...tenant });
}
export interface MembershipRecord { id: string; userId: string; status: string; tenant: TenantIdentity; role: { key: string; permissions: { permission: { key: string } }[] } }
export interface MembershipDirectory { membership(userId: string, slug: string): Promise<MembershipRecord | null> }
export async function resolveAuthenticatedTenant(userId: string | undefined, slug: string, directory: MembershipDirectory): Promise<TenantContext> {
  if (!userId) throw new AccessError('UNAUTHENTICATED');
  if (!tenantSlugSchema.safeParse(slug).success) throw new AccessError('NOT_FOUND');
  const record = await directory.membership(userId, slug);
  if (!record || record.userId !== userId || record.status !== 'ACTIVE' || record.tenant.status !== 'ACTIVE' || record.tenant.slug !== slug) throw new AccessError('NOT_FOUND');
  return Object.freeze({ tenant: Object.freeze({ ...record.tenant }), userId, membershipId: record.id, role: record.role.key, permissions: Object.freeze(record.role.permissions.map(item => item.permission.key)) });
}
export function requirePermission(context: TenantContext, permission: PermissionKey): void {
  if (!context.permissions.includes(permission)) throw new AccessError('FORBIDDEN');
}
export class TenantContextStore {
  private readonly storage = new AsyncLocalStorage<TenantContext>();
  run<T>(context: TenantContext, callback: () => T): T { return this.storage.run(context, callback); }
  get(): TenantContext { const context = this.storage.getStore(); if (!context) throw new AccessError('UNAUTHENTICATED'); return context; }
}
const tenantSelect = { id: true, name: true, slug: true, status: true, planId: true } as const;
export function prismaTenantDirectory(db: PrismaClient): TenantDirectory & MembershipDirectory {
  return {
    bySlug: slug => db.tenant.findUnique({ where: { slug }, select: tenantSelect }),
    byDomain: async hostname => (await db.domain.findFirst({ where: { hostname, status: 'ACTIVE' }, select: { tenant: { select: tenantSelect } } }))?.tenant ?? null,
    membership: (userId, slug) => db.membership.findFirst({ where: { userId, tenant: { slug }, status: 'ACTIVE' }, include: { tenant: { select: tenantSelect }, role: { include: { permissions: { include: { permission: true } } } } } }),
  };
}
// Accept a verified server context. Never accept a tenant id from a request body.
export class TenantSiteRepository {
  constructor(private readonly db: PrismaClient, private readonly context: TenantContext) {}
  findSite(id: string) { return this.db.siteConfiguration.findFirst({ where: { id, tenantId: this.context.tenant.id }, select: { id: true, tenantId: true, themeId: true, title: true, description: true } }); }
  listDomains() { return this.db.domain.findMany({ where: { tenantId: this.context.tenant.id }, select: { id: true, hostname: true, status: true } }); }
}
