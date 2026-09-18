import type { ReactNode } from 'react';
import type { ContextView, FeatureView } from '@platform/web-kit';
import { apiGet } from '@platform/web-kit/server';
import { DashboardNavigation } from '../../../components/dashboard-navigation';

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = `/v1/tenants/${encodeURIComponent(slug)}`;
  const [context, features] = await Promise.all([apiGet<ContextView>(`${base}/context`), apiGet<FeatureView[]>(`${base}/features`)]);
  const enabled = (key: string) => features.some(feature => feature.key === key && feature.enabled);
  const allowed = (key: string) => context.permissions.includes(key);
  return <div className="dashboard-workspace">{children}<DashboardNavigation slug={context.tenant.slug} agenda={enabled('booking') && allowed('appointments.manage_all') && allowed('appointments.read')} customers={enabled('customers') && allowed('customers.read')} /></div>;
}
