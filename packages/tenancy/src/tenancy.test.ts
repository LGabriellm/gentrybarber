import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@platform/database';
import type { TenantContext, TenantIdentity } from '@platform/types';
import { normalizeHostname, prismaTenantDirectory, requirePermission, resolveAuthenticatedTenant, resolvePublicTenant, tenantSlugSchema, TenantContextStore, TenantSiteRepository, type MembershipRecord } from './index';

const tenantA: TenantIdentity = { id: 'tenant-a', slug: 'alpha', name: 'Alpha', status: 'ACTIVE', planId: 'plan-a' };
const tenantB: TenantIdentity = { id: 'tenant-b', slug: 'bravo', name: 'Bravo', status: 'ACTIVE', planId: 'plan-b' };
const contextA: TenantContext = { tenant: tenantA, userId: 'user-a', membershipId: 'membership-a', role: 'OWNER', permissions: ['website.manage'] };
const contextB: TenantContext = { tenant: tenantB, userId: 'user-b', membershipId: 'membership-b', role: 'BARBER', permissions: ['appointments.read'] };

function membership(overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  return { id: 'membership-a', userId: 'user-a', status: 'ACTIVE', tenant: tenantA, role: { key: 'OWNER', permissions: [{ permission: { key: 'website.manage' } }] }, ...overrides };
}

describe('public hostname resolution', () => {
  it('normalizes case, trailing dot and development port before lookup', async () => {
    expect(normalizeHostname('ALPHA.Barber.test.:3000')).toBe('alpha.barber.test');
    const directory = { bySlug: vi.fn().mockResolvedValue(tenantA), byDomain: vi.fn() };
    expect((await resolvePublicTenant('ALPHA.Barber.test:3000', 'barber.test', directory)).id).toBe(tenantA.id);
    expect(directory.bySlug).toHaveBeenCalledWith('alpha');
    expect(directory.byDomain).not.toHaveBeenCalled();
  });

  it.each(['', 'https://alpha.barber.test', 'alpha.barber.test/path', 'alpha.barber.test?x=1', 'alpha.barber.test#fragment', 'user@alpha.barber.test', 'alpha.barber.test,evil.test', 'alpha..barber.test', '-alpha.barber.test', 'alpha_.barber.test', 'alpha.barber.test\\evil', 'alpha.barber.test%00', 'alpha.barber.test:abc', 'alpha.barber.test:99999'])('rejects malformed hostname %j', value => {
    expect(() => normalizeHostname(value)).toThrow('INVALID_INPUT');
  });

  it.each(['www', 'api', 'admin', 'app', 'dashboard', 'status', 'support', 'cdn', 'assets', 'mail', 'preview'])('does not resolve reserved subdomain %s as a tenant', async slug => {
    const directory = { bySlug: vi.fn(), byDomain: vi.fn() };
    expect(tenantSlugSchema.safeParse(slug).success).toBe(false);
    await expect(resolvePublicTenant(`${slug}.barber.test`, 'barber.test', directory)).rejects.toThrow('NOT_FOUND');
    expect(directory.bySlug).not.toHaveBeenCalled();
    expect(directory.byDomain).not.toHaveBeenCalled();
  });

  it('rejects nested tenant slugs and platform apex without directory fallback', async () => {
    const directory = { bySlug: vi.fn(), byDomain: vi.fn() };
    await expect(resolvePublicTenant('a.b.barber.test', 'barber.test', directory)).rejects.toThrow('NOT_FOUND');
    await expect(resolvePublicTenant('barber.test', 'barber.test', directory)).rejects.toThrow('NOT_FOUND');
    expect(directory.bySlug).not.toHaveBeenCalled();
    expect(directory.byDomain).not.toHaveBeenCalled();
  });

  it('requires active tenant even when custom domain resolves', async () => {
    const directory = { bySlug: vi.fn(), byDomain: vi.fn().mockResolvedValue({ ...tenantA, status: 'SUSPENDED' }) };
    await expect(resolvePublicTenant('alpha.com.br', 'barber.test', directory)).rejects.toThrow('NOT_FOUND');
    expect(directory.byDomain).toHaveBeenCalledWith('alpha.com.br');
  });

  it('looks up only ACTIVE custom domains in persistence', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { domain: { findFirst } } as unknown as PrismaClient;
    await expect(resolvePublicTenant('suspended.test', 'barber.test', prismaTenantDirectory(db))).rejects.toThrow('NOT_FOUND');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { hostname: 'suspended.test', status: 'ACTIVE' } }));
  });
});

describe('authenticated tenant and permission boundary', () => {
  it('derives tenant and permissions from the membership lookup', async () => {
    const directory = { membership: vi.fn().mockResolvedValue(membership()) };
    const resolved = await resolveAuthenticatedTenant('user-a', 'alpha', directory);
    expect(directory.membership).toHaveBeenCalledWith('user-a', 'alpha');
    expect(resolved).toEqual(contextA);
    expect(Object.isFrozen(resolved.permissions)).toBe(true);
    expect(Object.isFrozen(resolved.tenant)).toBe(true);
  });

  it('requires a server-authenticated user before membership lookup', async () => {
    const directory = { membership: vi.fn() };
    await expect(resolveAuthenticatedTenant(undefined, 'alpha', directory)).rejects.toThrow('UNAUTHENTICATED');
    expect(directory.membership).not.toHaveBeenCalled();
  });

  it.each([
    membership({ userId: 'user-b' }),
    membership({ tenant: tenantB }),
    membership({ status: 'SUSPENDED' }),
    membership({ tenant: { ...tenantA, status: 'SUSPENDED' } }),
    null,
  ])('rejects mismatched or inactive membership %j', async record => {
    await expect(resolveAuthenticatedTenant('user-a', 'alpha', { membership: vi.fn().mockResolvedValue(record) })).rejects.toThrow('NOT_FOUND');
  });

  it('uses explicit permission keys, including for privileged role names', () => {
    expect(() => requirePermission(contextA, 'website.manage')).not.toThrow();
    expect(() => requirePermission(contextA, 'billing.read')).toThrow('FORBIDDEN');
    expect(() => requirePermission({ ...contextB, role: 'SUPER_ADMIN' }, 'website.manage')).toThrow('FORBIDDEN');
  });

  it('preserves separate contexts across concurrent asynchronous requests', async () => {
    const store = new TenantContextStore();
    let release: () => void = () => undefined;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const a = store.run(contextA, async () => { await barrier; await Promise.resolve(); return store.get(); });
    const b = store.run(contextB, async () => { await barrier; await Promise.resolve(); return store.get(); });
    expect(() => store.get()).toThrow('UNAUTHENTICATED');
    release();
    const [aResult, bResult] = await Promise.all([a, b]);
    expect(aResult.tenant.id).toBe(tenantA.id);
    expect(bResult.tenant.id).toBe(tenantB.id);
    expect(aResult.userId).toBe('user-a');
    expect(bResult.userId).toBe('user-b');
    expect(() => store.get()).toThrow('UNAUTHENTICATED');
  });

  it('binds site and domain repository queries to the verified context tenant', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { siteConfiguration: { findFirst }, domain: { findMany } } as unknown as PrismaClient;
    const repository = new TenantSiteRepository(db, contextA);
    expect(await repository.findSite('site-owned-by-b')).toBeNull();
    await repository.listDomains();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'site-owned-by-b', tenantId: tenantA.id } }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: tenantA.id } }));
  });
});
