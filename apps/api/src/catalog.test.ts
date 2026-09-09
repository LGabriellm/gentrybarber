import type { PrismaClient } from '@platform/database';
import type { TenantContext } from '@platform/types';
import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { CatalogService } from './catalog';

const context: TenantContext = {
  tenant: { id: 'tenant-a', name: 'Barbearia A', slug: 'barbearia-a', status: 'ACTIVE', planId: 'plan-configured' },
  userId: 'user-a', membershipId: 'membership-a', role: 'MANAGER',
  permissions: ['services.manage', 'professionals.manage'],
};
const serviceFields = { name: 'Corte', description: null, durationMinutes: 30, priceCents: 5_000, active: true };
const professionalFields = { name: 'Rafael', bio: null, active: true, serviceIds: ['service-a'] };
const expectedVersion = 1;

function fixture() {
  const transaction = vi.fn().mockRejectedValue(new Error('Unexpected database access'));
  const catalog = new CatalogService({ $transaction: transaction } as unknown as PrismaClient);
  return { catalog, transaction };
}

describe('catalog input and permission boundaries', () => {
  const deniedCalls = [
    ['list services', (catalog: CatalogService, denied: TenantContext) => catalog.listServices(denied)],
    ['create service', (catalog: CatalogService, denied: TenantContext) => catalog.createService(denied, {})],
    ['update service', (catalog: CatalogService, denied: TenantContext) => catalog.updateService(denied, 'service-a', {})],
    ['list professionals', (catalog: CatalogService, denied: TenantContext) => catalog.listProfessionals(denied)],
    ['create professional', (catalog: CatalogService, denied: TenantContext) => catalog.createProfessional(denied, {})],
    ['update professional', (catalog: CatalogService, denied: TenantContext) => catalog.updateProfessional(denied, 'professional-a', {})],
  ] as const;

  it.each(deniedCalls)('denies %s without the relevant permission before reading input or data', async (_name, call) => {
    const { catalog, transaction } = fixture();
    await expect(call(catalog, { ...context, permissions: ['website.manage'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['tenant authority', { tenantId: 'tenant-b' }],
    ['resource identity', { id: 'chosen-id' }],
    ['created timestamp', { createdAt: expectedVersion }],
    ['blank name', { name: '  ' }],
    ['long name', { name: 'a'.repeat(121) }],
    ['long description', { description: 'a'.repeat(2_001) }],
    ['fractional cents', { priceCents: 2.5 }],
    ['negative cents', { priceCents: -1 }],
    ['over-limit price', { priceCents: 100_000_001 }],
    ['string cents', { priceCents: '5000' }],
    ['zero duration', { durationMinutes: 0 }],
    ['fractional duration', { durationMinutes: 1.5 }],
    ['over-limit duration', { durationMinutes: 1_441 }],
    ['string active', { active: 'true' }],
    ['blank location', { locationId: '' }],
    ['long location', { locationId: 'a'.repeat(129) }],
    ['invalid location', { locationId: '../location-a' }],
  ])('rejects service %s without opening a transaction', async (_name, invalid) => {
    const { catalog, transaction } = fixture();
    await expect(catalog.createService(context, { ...serviceFields, locationId: 'location-a', ...invalid })).rejects.toBeInstanceOf(ZodError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['image URL', { photoUrl: 'https://example.com/photo.jpg' }],
    ['membership assignment', { membershipId: 'membership-b' }],
    ['blank name', { name: '\t\n' }],
    ['long bio', { bio: 'a'.repeat(2_001) }],
    ['duplicate services', { serviceIds: ['service-a', 'service-a'] }],
    ['too many services', { serviceIds: Array.from({ length: 101 }, (_, index) => `service-${index}`) }],
    ['blank service id', { serviceIds: [''] }],
    ['long service id', { serviceIds: ['a'.repeat(129)] }],
    ['non-string service id', { serviceIds: [1] }],
    ['invalid service id', { serviceIds: ['service/a'] }],
  ])('rejects professional %s without opening a transaction', async (_name, invalid) => {
    const { catalog, transaction } = fixture();
    await expect(catalog.createProfessional(context, { ...professionalFields, locationId: 'location-a', ...invalid })).rejects.toBeInstanceOf(ZodError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['service', (catalog: CatalogService, input: unknown) => catalog.updateService(context, 'service-a', input), serviceFields],
    ['professional', (catalog: CatalogService, input: unknown) => catalog.updateProfessional(context, 'professional-a', input), professionalFields],
  ] as const)('requires a complete versioned %s update and preserves location', async (_name, call, fields) => {
    const { catalog, transaction } = fixture();
    for (const invalid of [
      fields,
      { name: 'Novo nome', expectedVersion },
      { ...fields, expectedVersion: -1 },
      { ...fields, expectedVersion, locationId: 'location-b' },
      { ...fields, expectedVersion, tenantId: 'tenant-b' },
    ]) await expect(call(catalog, invalid)).rejects.toBeInstanceOf(ZodError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['', 'a'.repeat(129), '../service-a', 'service a'])('rejects an invalid resource id %j', async id => {
    const { catalog, transaction } = fixture();
    await expect(catalog.updateService(context, id, { ...serviceFields, expectedVersion })).rejects.toBeInstanceOf(ZodError);
    await expect(catalog.updateProfessional(context, id, { ...professionalFields, expectedVersion })).rejects.toBeInstanceOf(ZodError);
    expect(transaction).not.toHaveBeenCalled();
  });
});
