import type { PrismaClient, Prisma } from '@platform/database';
import { AccessError, type FeatureKey } from '@platform/types';

export interface FeatureGrant { enabled: boolean; limit: number | null }
export interface FeatureSource {
  tenant(tenantId: string): Promise<{ status: string; planId: string } | null>;
  override(tenantId: string, key: FeatureKey): Promise<(FeatureGrant & { expiresAt: Date | null }) | null>;
  planFeature(planId: string, key: FeatureKey): Promise<FeatureGrant | null>;
}
const denied: FeatureGrant = Object.freeze({ enabled: false, limit: null });
export class FeatureEngine {
  constructor(private readonly source: FeatureSource, private readonly now = () => new Date()) {}
  async access(tenantId: string, feature: FeatureKey): Promise<FeatureGrant> {
    const tenant = await this.source.tenant(tenantId);
    if (!tenant || tenant.status !== 'ACTIVE') return denied;
    const override = await this.source.override(tenantId, feature);
    if (override && (!override.expiresAt || override.expiresAt > this.now())) return { enabled: override.enabled, limit: override.limit };
    return (await this.source.planFeature(tenant.planId, feature)) ?? denied;
  }
  async hasFeature(tenantId: string, feature: FeatureKey): Promise<boolean> { return (await this.access(tenantId, feature)).enabled; }
  async require(tenantId: string, feature: FeatureKey): Promise<void> { if (!await this.hasFeature(tenantId, feature)) throw new AccessError('FEATURE_DISABLED'); }
}
export function prismaFeatureSource(db: PrismaClient | Prisma.TransactionClient): FeatureSource {
  return {
    tenant: tenantId => db.tenant.findUnique({ where: { id: tenantId }, select: { status: true, planId: true } }),
    override: (tenantId, key) => db.tenantFeatureOverride.findFirst({ where: { tenantId, feature: { key } }, select: { enabled: true, limit: true, expiresAt: true } }),
    planFeature: (planId, key) => db.planFeature.findFirst({ where: { planId, feature: { key } }, select: { enabled: true, limit: true } }),
  };
}
// Adapter contract only. Mercado Pago integration and signed webhooks belong to Phase 2.
export interface BillingProvider {
  createCustomer(input: { tenantId: string; email: string; idempotencyKey: string }): Promise<{ customerId: string }>;
  createSetupPayment(input: { tenantId: string; amountCents: number; idempotencyKey: string }): Promise<{ paymentId: string; checkoutUrl: string }>;
  createSubscription(input: { tenantId: string; planId: string; idempotencyKey: string }): Promise<{ subscriptionId: string }>;
  changeSubscription(subscriptionId: string, planId: string): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  processWebhook(rawBody: Uint8Array, headers: Record<string, string>): Promise<{ eventId: string; processed: boolean }>;
}
