import { platformName } from '@platform/config';
import { apiGet } from '@platform/web-kit/server';
import { SignOutButton } from '@platform/web-kit/auth-form';
export const dynamic = 'force-dynamic';
interface Tenant { id: string; name: string; slug: string; status: string; plan: { name: string } }
export default async function Admin() {
const tenants = await apiGet<Tenant[]>('/v1/admin/tenants');
const name = platformName();
return <div className="shell"><header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name} <span className="badge">Admin</span></a><SignOutButton /></header><main className="main"><div className="intro"><span className="eyebrow">Administração da plataforma</span><h1>Uma plataforma.<br/>Muitas identidades.</h1><p>Visão dos ambientes cadastrados na infraestrutura compartilhada.</p></div><section className="panel"><div className="section-heading"><h2>Barbearias</h2><span className="badge">{tenants.length} ambientes exibidos</span></div><table className="data-table"><thead><tr><th>Barbearia</th><th>Endereço</th><th>Plano</th><th>Status</th></tr></thead><tbody>{tenants.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.slug}</td><td>{t.plan.name}</td><td>{t.status}</td></tr>)}</tbody></table>{!tenants.length && <p>Nenhum ambiente cadastrado.</p>}<p className="muted">Exibição dos 100 ambientes mais recentes. Gestão de planos e cobrança chegarão nas próximas etapas.</p></section></main><footer className="footer"><span>{name} · Administração</span><span>Acesso validado pela plataforma</span></footer></div>;
}


