import { describe, expect, it, vi } from 'vitest';
import { AccessError } from '@platform/types';
import { FoundationServices } from './services';

function subject(site: unknown = {
  theme: { active: true, ownerTenantId: null },
  publishedThemeVersion: { status: 'PUBLISHED' },
}) {
  const bySlug = vi.fn(async (slug: string) => ({ id: 'tenant-a', name: 'Tenant A', slug, status: 'ACTIVE', planId: 'plan-a' }));
  const requireFeature = vi.fn(async () => undefined);
  const findFirst = vi.fn(async () => site);
  const services = Object.assign(Object.create(FoundationServices.prototype), {
    config: { PLATFORM_DOMAIN: 'platform.test' },
    directory: { bySlug, byDomain: vi.fn() },
    features: { require: requireFeature },
    db: { siteConfiguration: { findFirst } },
  }) as FoundationServices;
  return { services, bySlug, requireFeature, findFirst };
}

describe('on-demand TLS authorization', () => {
  it('allows only a published platform tenant with the website entitlement', async () => {
    const { services, bySlug, requireFeature, findFirst } = subject();
    await expect(services.authorizePlatformTlsHostname('tenant-a.platform.test')).resolves.toEqual({ allowed: true });
    expect(bySlug).toHaveBeenCalledWith('tenant-a');
    expect(requireFeature).toHaveBeenCalledWith('tenant-a', 'website');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a', published: true } }));
  });

  it.each(['admin.platform.test', 'unknown.example.test', 'tenant-a.platform.test:443'])('rejects reserved, external or port-bearing TLS names: %s', async hostname => {
    const { services } = subject();
    await expect(services.authorizePlatformTlsHostname(hostname)).rejects.toBeInstanceOf(AccessError);
  });

  it('rejects a tenant without a valid published presentation', async () => {
    const { services } = subject(null);
    await expect(services.authorizePlatformTlsHostname('tenant-a.platform.test')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
