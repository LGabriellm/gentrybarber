'use client';
import { usePathname } from 'next/navigation';
import type { ContextView, FeatureView } from '@platform/web-kit';
export function TenantNavigation({ context, features }: { context: ContextView; features: FeatureView[] }) {
  const pathname = usePathname();
  const base = '/tenants/' + encodeURIComponent(context.tenant.slug);
  const enabled = (key: string) => features.some(f => f.key === key && f.enabled);
  const permission = (key: string) => context.permissions.includes(key);
  const booking = enabled('booking');
  const agenda = booking && permission('appointments.manage_all') && permission('appointments.read');
  const items = [
    { path: 'agenda', label: 'Agenda', allowed: agenda },
    { path: 'customers', label: 'Clientes', allowed: enabled('customers') && permission('customers.read') },
    { path: 'horarios', label: 'Horários e bloqueios', allowed: agenda && permission('schedules.manage') },
    { path: 'services', label: 'Serviços', allowed: booking && permission('services.manage') },
    { path: 'professionals', label: 'Profissionais', allowed: booking && permission('professionals.manage') },
    { path: 'locations', label: 'Dados da barbearia', allowed: permission('team.manage') },
    { path: 'finance', label: 'Financeiro', allowed: booking && permission('reports.read') },
  ];
  return <nav className="tenant-nav" aria-label="Gestão da barbearia">{items.filter(item => item.allowed).map(item => <a key={item.path} href={base + '/' + item.path} aria-current={pathname === base + '/' + item.path ? 'page' : undefined}>{item.label}</a>)}</nav>;
}
