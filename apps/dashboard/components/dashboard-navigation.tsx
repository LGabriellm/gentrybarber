'use client';

import { usePathname } from 'next/navigation';

export function DashboardNavigation({ slug, agenda, customers }: { slug: string; agenda: boolean; customers: boolean }) {
  const pathname = usePathname();
  const home = `/?tenant=${encodeURIComponent(slug)}`;
  const base = `/tenants/${encodeURIComponent(slug)}`;
  const items = [
    { href: home, label: 'Início', icon: 'home', active: pathname === '/' },
    ...(agenda ? [{ href: `${base}/agenda`, label: 'Agenda', icon: 'calendar', active: pathname === `${base}/agenda` }] : []),
    ...(customers ? [{ href: `${base}/customers`, label: 'Clientes', icon: 'people', active: pathname === `${base}/customers` }] : []),
    { href: `${home}#settings-title`, label: 'Ajustes', icon: 'settings', active: false },
  ];
  return <nav className="dashboard-bottom-nav" aria-label="Navegação rápida">{items.map(item => <a key={item.label} href={item.href} aria-current={item.active ? 'page' : undefined}><DashboardIcon name={item.icon} /><span>{item.label}</span></a>)}</nav>;
}

export function DashboardIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
    calendar: 'M5 5h14v16H5ZM8 3v4m8-4v4M5 10h14m-10 4h2m2 3h2',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  };
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.settings} /></svg>;
}
