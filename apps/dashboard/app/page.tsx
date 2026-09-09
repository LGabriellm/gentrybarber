import { featureLabels, roleLabels } from '@platform/web-kit';
import { platformName } from '@platform/config';
import { apiGet } from '@platform/web-kit/server';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { OnboardingForm } from '../components/onboarding-form';
import type { AccountView, ContextView, FeatureView, SiteView } from '@platform/web-kit';
export const dynamic = 'force-dynamic';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const me = await apiGet<AccountView>('/v1/me');
  const params = await searchParams;
  const selected = me.memberships.find(m => m.tenant.slug === params.tenant) ?? me.memberships[0];
  const context = selected ? await apiGet<ContextView>('/v1/tenants/' + encodeURIComponent(selected.tenant.slug) + '/context') : null;
  const features = context ? await apiGet<FeatureView[]>('/v1/tenants/' + encodeURIComponent(context.tenant.slug) + '/features') : [];
  const bookingEnabled = features.some(feature => feature.key === 'booking' && feature.enabled);
  const canManageServices = bookingEnabled && context?.permissions.includes('services.manage');
  const canManageProfessionals = bookingEnabled && context?.permissions.includes('professionals.manage');
  const canManageLocations = context?.permissions.includes('team.manage');
  const canOpenAgenda = bookingEnabled && context?.permissions.includes('appointments.manage_all') && context.permissions.includes('appointments.read');
  const canManageSchedules = canOpenAgenda && context?.permissions.includes('schedules.manage');
  const site = context?.permissions.includes('website.manage') && features.some(f => f.key === 'website' && f.enabled) ? await apiGet<SiteView>('/v1/tenants/' + encodeURIComponent(context.tenant.slug) + '/site') : null;
  const name = platformName();
  const publicHost = context ? context.tenant.slug + '.' + (process.env.PLATFORM_DOMAIN || 'localhost') : '';
  const publicUrl = process.env.NODE_ENV === 'production' ? 'https://' + publicHost : 'http://' + publicHost + ':3000';
  return <div className="shell"><header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a><SignOutButton /></header><main className="main"><div className="intro"><span className="eyebrow">Seu ambiente</span><h1>Olá, {me.user.name.split(' ')[0]}.</h1><p>Sua identidade, suas pessoas e sua presença digital em um só lugar.</p></div>
  {!context ? <OnboardingForm /> : <><nav className="tenant-nav" aria-label="Selecionar barbearia">{me.memberships.map(m => <a key={m.id} href={'/?tenant=' + encodeURIComponent(m.tenant.slug)} aria-current={m.tenant.slug === context.tenant.slug}>{m.tenant.name}</a>)}</nav><div className="grid"><article className="card"><span className="eyebrow">Barbearia</span><span className="number">{context.tenant.name}</span><span className="badge">Ambiente ativo</span></article><article className="card"><span className="eyebrow">Seu acesso</span><span className="number">{roleLabels[context.role] ?? context.role}</span><p>{context.permissions.length} permissões neste ambiente</p></article><article className="card"><span className="eyebrow">Presença digital</span><span className="number">{site?.themeId ?? 'Acesso restrito'}</span><p>Apresentação vinculada à sua identidade</p></article></div>
  {site && <section className="panel"><div className="section-heading"><h2>Meu site</h2><a href={publicUrl} className="button secondary" target="_blank" rel="noreferrer">Visitar site ↗</a></div><h3>{site.title}</h3><p>{site.description}</p><span className="code-value">{publicHost}</span></section>}
  {(canOpenAgenda || canManageServices || canManageProfessionals || canManageLocations) && <section className="panel"><h2>Organize sua operação</h2><p>Acompanhe os atendimentos e mantenha os horários, serviços, profissionais e unidades atualizados.</p><nav className="tenant-nav" aria-label="Gestão da barbearia">{canOpenAgenda && <a href={'/tenants/' + encodeURIComponent(context.tenant.slug) + '/agenda'}>Abrir agenda</a>}{canManageSchedules && <a href={'/tenants/' + encodeURIComponent(context.tenant.slug) + '/horarios'}>Horários e bloqueios</a>}{canManageServices && <a href={'/tenants/' + encodeURIComponent(context.tenant.slug) + '/services'}>Gerenciar serviços</a>}{canManageProfessionals && <a href={'/tenants/' + encodeURIComponent(context.tenant.slug) + '/professionals'}>Gerenciar profissionais</a>}{canManageLocations && <a href={'/tenants/' + encodeURIComponent(context.tenant.slug) + '/locations'}>Gerenciar unidades</a>}</nav></section>}
  <section className="panel"><h2>Recursos do ambiente</h2><p>Os acessos abaixo refletem as configurações atuais da sua barbearia.</p><ul className="feature-list">{features.filter(f => f.enabled).map(f => <li key={f.key}>{featureLabels[f.key] ?? f.key}<span>Ativo</span></li>)}</ul></section></>}
  </main><footer className="footer"><span>{name} · Área da barbearia</span><span>Seu sistema é nosso. Sua identidade é sua.</span></footer></div>;
}



