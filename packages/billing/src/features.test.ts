import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@platform/database';
import { FeatureEngine, prismaFeatureSource, type FeatureSource } from './index';

const now = new Date('2026-09-04T12:00:00.000Z');

function source(overrides: Partial<FeatureSource> = {}): FeatureSource {
  return {
    tenant: vi.fn().mockResolvedValue({ status: 'ACTIVE', planId: 'arbitrary-plan-id' }),
    override: vi.fn().mockResolvedValue(null),
    planFeature: vi.fn().mockResolvedValue({ enabled: true, limit: 5 }),
    ...overrides,
  };
}

describe('feature entitlement precedence', () => {
  it('honors a disabled tenant override over an enabled plan feature', async () => {
    const data = source({ override: vi.fn().mockResolvedValue({ enabled: false, limit: null, expiresAt: null }) });
    const engine = new FeatureEngine(data, () => now);
    expect(await engine.hasFeature('tenant-a', 'custom_design')).toBe(false);
    await expect(engine.require('tenant-a', 'custom_design')).rejects.toThrow('FEATURE_DISABLED');
    expect(data.planFeature).not.toHaveBeenCalled();
  });

  it('allows an enabled unexpired override over a disabled plan', async () => {
    const data = source({ override: vi.fn().mockResolvedValue({ enabled: true, limit: 2, expiresAt: new Date('2026-09-04T12:00:00.001Z') }), planFeature: vi.fn().mockResolvedValue({ enabled: false, limit: null }) });
    expect(await new FeatureEngine(data, () => now).access('tenant-a', 'custom_domain')).toEqual({ enabled: true, limit: 2 });
    expect(data.override).toHaveBeenCalledWith('tenant-a', 'custom_domain');
  });

  it.each([new Date('2026-09-04T11:59:59.999Z'), now])('expires overrides at their precise expiration instant %s', async expiresAt => {
    const data = source({ override: vi.fn().mockResolvedValue({ enabled: true, limit: 99, expiresAt }), planFeature: vi.fn().mockResolvedValue({ enabled: false, limit: null }) });
    expect(await new FeatureEngine(data, () => now).hasFeature('tenant-a', 'custom_design')).toBe(false);
    expect(data.planFeature).toHaveBeenCalledWith('arbitrary-plan-id', 'custom_design');
  });

  it.each([null, { status: 'SUSPENDED', planId: 'plan-a' }, { status: 'CANCELED', planId: 'plan-a' }, { status: 'TRIAL', planId: 'plan-a' }])('denies missing or inactive tenants before overrides %j', async tenant => {
    const data = source({ tenant: vi.fn().mockResolvedValue(tenant), override: vi.fn().mockResolvedValue({ enabled: true, limit: null, expiresAt: null }) });
    expect(await new FeatureEngine(data, () => now).access('tenant-a', 'website')).toEqual({ enabled: false, limit: null });
    expect(data.override).not.toHaveBeenCalled();
    expect(data.planFeature).not.toHaveBeenCalled();
  });

  it('fails closed when feature is absent from overrides and plan', async () => {
    const data = source({ planFeature: vi.fn().mockResolvedValue(null) });
    expect(await new FeatureEngine(data).hasFeature('tenant-a', 'custom_design')).toBe(false);
  });

  it('resolves by stored plan id without recognizing commercial plan names', async () => {
    const planFeature = vi.fn().mockResolvedValue({ enabled: true, limit: 3 });
    const data = source({ tenant: vi.fn().mockResolvedValue({ status: 'ACTIVE', planId: 'renamed-2026-private-plan' }), planFeature });
    expect(await new FeatureEngine(data).access('tenant-a', 'custom_domain')).toEqual({ enabled: true, limit: 3 });
    expect(planFeature).toHaveBeenCalledWith('renamed-2026-private-plan', 'custom_domain');
  });

  it('does not allow tenant A to inherit tenant B overrides during concurrent resolution', async () => {
    const data = source({
      tenant: vi.fn(async (tenantId: string) => ({ status: 'ACTIVE', planId: tenantId === 'tenant-a' ? 'plan-a' : 'plan-b' })),
      override: vi.fn(async (tenantId: string) => tenantId === 'tenant-b' ? { enabled: true, limit: 10, expiresAt: null } : null),
      planFeature: vi.fn().mockResolvedValue({ enabled: false, limit: null }),
    });
    const engine = new FeatureEngine(data, () => now);
    const [a, b] = await Promise.all([engine.access('tenant-a', 'custom_design'), engine.access('tenant-b', 'custom_design')]);
    expect(a).toEqual({ enabled: false, limit: null });
    expect(b).toEqual({ enabled: true, limit: 10 });
    expect(data.planFeature).toHaveBeenCalledWith('plan-a', 'custom_design');
    expect(data.override).toHaveBeenCalledWith('tenant-a', 'custom_design');
    expect(data.override).toHaveBeenCalledWith('tenant-b', 'custom_design');
  });

  it('includes tenant, feature and plan scope in persistence queries', async () => {
    const tenant = vi.fn().mockResolvedValue(null);
    const override = vi.fn().mockResolvedValue(null);
    const planFeature = vi.fn().mockResolvedValue(null);
    const db = { tenant: { findUnique: tenant }, tenantFeatureOverride: { findFirst: override }, planFeature: { findFirst: planFeature } } as unknown as PrismaClient;
    const adapter = prismaFeatureSource(db);
    await adapter.tenant('tenant-a');
    await adapter.override('tenant-a', 'custom_design');
    await adapter.planFeature('plan-a', 'custom_design');
    expect(tenant).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tenant-a' } }));
    expect(override).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a', feature: { key: 'custom_design' } } }));
    expect(planFeature).toHaveBeenCalledWith(expect.objectContaining({ where: { planId: 'plan-a', feature: { key: 'custom_design' } } }));
  });
});
