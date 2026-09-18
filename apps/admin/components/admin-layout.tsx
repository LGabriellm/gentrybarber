import type { ReactNode } from 'react';
import { platformName } from '@platform/config';
import { SignOutButton } from '@platform/web-kit/auth-form';
import './admin.css';

const navigation = [
  { key: 'overview', href: '/', label: 'Visão geral', symbol: '◫' },
  { key: 'tenants', href: '/tenants', label: 'Barbearias', symbol: '⌂' },
  { key: 'users', href: '/users', label: 'Usuários', symbol: '◎' },
  { key: 'plans', href: '/plans', label: 'Planos', symbol: '▤' },
] as const;
export function AdminLayout({ children, activeTab, title, description, action }: { children: ReactNode; activeTab: typeof navigation[number]['key']; title?: string; description?: string; action?: ReactNode }) {
  const name = platformName();
  const current = navigation.find(item => item.key === activeTab)!;
  return <div className="admin-app">
    <a className="admin-skip" href="#admin-content">Pular para o conteúdo</a>
    <aside className="admin-sidebar">
      <a className="admin-brand" href="/"><span className="admin-brand-mark" aria-hidden="true">{name[0]}</span><span>{name}<small>Administração global</small></span></a>
      <div className="admin-nav-label">PLATAFORMA</div>
      <nav aria-label="Navegação de administração">{navigation.map(item => <a key={item.key} href={item.href} aria-current={activeTab === item.key ? 'page' : undefined}><span aria-hidden="true">{item.symbol}</span>{item.label}{activeTab === item.key && <span className="admin-nav-current" aria-hidden="true">›</span>}</a>)}</nav>
      <div className="admin-sidebar-bottom"><span className="admin-role-mark" aria-hidden="true">A</span><div><strong>Administrador</strong><small>Acesso global</small></div><SignOutButton /></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><span>Plataforma <span aria-hidden="true">/</span> <strong>{current.label}</strong></span><span className="admin-access"><i aria-hidden="true" /> Administração global</span></header>
      <main id="admin-content" className="admin-content"><div className="admin-page-heading"><div><span className="eyebrow">{activeTab === 'overview' ? 'SEU CENTRO DE OPERAÇÕES' : 'GESTÃO DA PLATAFORMA'}</span><h1>{title ?? current.label}</h1><p>{description ?? 'Acompanhe os dados e organize a operação da plataforma.'}</p></div>{action}</div>{children}</main>
      <footer className="admin-footer"><span>{name} · Administração</span><span>Uma plataforma. Diferentes barbearias.</span></footer>
    </div>
  </div>;
}
