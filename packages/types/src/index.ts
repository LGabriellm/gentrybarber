export const featureKeys = ['website', 'booking', 'customers', 'advanced_site_builder', 'custom_domain', 'custom_design', 'custom_pages', 'custom_css', 'premium_animations', 'white_label', 'finance', 'commissions', 'inventory', 'loyalty', 'coupons', 'reviews', 'analytics', 'whatsapp_automation', 'multi_location'] as const;
export type FeatureKey = typeof featureKeys[number];
export const permissionKeys = ['appointments.read', 'appointments.create', 'appointments.update', 'appointments.manage_all', 'schedules.manage', 'customers.read', 'customers.update', 'services.manage', 'professionals.manage', 'website.manage', 'design.manage', 'domains.manage', 'reports.read', 'billing.read', 'team.manage'] as const;
export type PermissionKey = typeof permissionKeys[number];
export interface TenantIdentity { readonly id: string; readonly slug: string; readonly name: string; readonly status: string; readonly planId: string }
export interface TenantContext { readonly tenant: TenantIdentity; readonly userId: string; readonly membershipId: string; readonly role: string; readonly permissions: readonly string[] }
export class AccessError extends Error {
  constructor(public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'FEATURE_DISABLED' | 'INVALID_INPUT' | 'CONFLICT', message = code) { super(message); this.name = 'AccessError'; }
}
export type * from './catalog';
export type * from './booking';
export type * from './locations';

export interface FinanceSummaryView {
  todayTotalCents: number;
  monthTotalCents: number;
  todayAppointments: number;
  monthAppointments: number;
  professionalsRevenue: { id: string; name: string; totalCents: number }[];
  topServices: { id: string; name: string; count: number; totalCents: number }[];
}
