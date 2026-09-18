import { featureLabels, roleLabels } from '@platform/web-kit';
import { platformName } from '@platform/config';
import { apiGet } from '@platform/web-kit/server';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { OnboardingForm } from '../components/onboarding-form';
import type { AccountView, ContextView, FeatureView } from '@platform/web-kit';

import '../components/dashboard-home.css';
import { DashboardDirectory } from '../components/dashboard-directory';
import { DashboardNavigation } from '../components/dashboard-navigation';

interface SetupStatus { locationsCount: number; hasActiveServices: boolean; activeProfessionalsCount: number; soloProfessionalName: string | null; }

export const dynamic = 'force-dynamic';
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const me = await apiGet<AccountView>('/v1/me');
  const params = await searchParams;
  const selected = me.memberships.find(m => m.tenant.slug === params.tenant) ?? me.memberships[0];
  const base = selected ? '/v1/tenants/' + encodeURIComponent(selected.tenant.slug) : '';

  const [context, features, setup] = await Promise.all([
    selected ? apiGet<ContextView>(base + '/context') : Promise.resolve(null),
    selected ? apiGet<FeatureView[]>(base + '/features') : Promise.resolve([]),
    selected ? apiGet<SetupStatus>(base + '/setup') : Promise.resolve(null),
  ]);

  const enabled = (key: string) => features.some(f => f.key === key && f.enabled);
  const permitted = (key: string) => !!context?.permissions.includes(key);
  const booking = enabled('booking');
  const agenda = booking && permitted('appointments.manage_all') && permitted('appointments.read');
  const customers = enabled('customers') && permitted('customers.read');
  const schedules = agenda && permitted('schedules.manage');
  const services = booking && permitted('services.manage');
  const professionals = booking && permitted('professionals.manage');
  const locations = permitted('team.manage');

  const solo = setup?.activeProfessionalsCount === 1;
  const oneLocation = setup?.locationsCount === 1;
  const name = platformName();
  const href = context ? '/tenants/' + encodeURIComponent(context.tenant.slug) : '';
  const finance = permitted('reports.read');
  const routine = [
    ...(agenda ? [{ href: href + '/agenda', title: 'Agenda do dia', description: 'Veja os próximos atendimentos, reserve horários e acompanhe cada cliente.', mark: '01' }] : []),
    ...(customers ? [{ href: href + '/customers', title: 'Clientes', description: 'Encontre cadastros, atualize contatos e consulte suas anotações.', mark: '02' }] : []),
    ...(schedules ? [{ href: href + '/horarios', title: 'Horários e pausas', description: solo ? 'Organize sua semana, intervalos, folgas e férias em um só lugar.' : 'Defina o expediente, os horários da equipe e os períodos indisponíveis.', mark: '03' }] : []),
    ...(finance ? [{ href: href + '/finance', title: 'Gestão Financeira', description: 'Acompanhe o faturamento, os atendimentos e o desempenho da equipe.', mark: '05' }] : []),
  ];
  const configuration = [
    ...(services ? [{ href: href + '/services', title: 'Serviços e preços', description: 'Defina o que você oferece, quanto custa e quanto tempo cada serviço leva.', mark: 'S' }] : []),
    ...(professionals ? [{ href: href + '/professionals', title: solo ? 'Cadastro do profissional' : 'Profissionais', description: solo ? 'Atualize os dados de quem atende e os serviços que realiza. Adicione profissionais quando precisar.' : 'Cadastre quem atende e associe os serviços de cada profissional.', mark: 'P' }] : []),
    ...(locations ? [{ href: href + '/locations', title: oneLocation || !enabled('multi_location') ? 'Dados da barbearia' : 'Barbearias e unidades', description: oneLocation || !enabled('multi_location') ? 'Organize nome, endereço, contato e local de atendimento.' : 'Gerencie os endereços e os dados de cada unidade.', mark: 'B' }] : []),
  ];
  return <div className="shell dashboard-home dashboard-workspace">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a><SignOutButton /></header>
    <main className="main">
      {!context ? <><div className="intro"><span className="eyebrow">Comece por aqui</span><h1>Olá, {me.user.name.split(' ')[0]}.</h1><p>Cadastre sua barbearia para organizar os serviços e começar a atender.</p></div><OnboardingForm /></> : <>
        {me.memberships.length > 1 && <nav className="tenant-nav" aria-label="Selecionar barbearia">{me.memberships.map(m => <a key={m.id} href={'/?tenant=' + encodeURIComponent(m.tenant.slug)} aria-current={m.tenant.slug === context.tenant.slug ? 'page' : undefined}>{m.tenant.name}</a>)}</nav>}
        <section className="dashboard-welcome"><div><span className="eyebrow">Seu espaço de trabalho</span><h1>{context.tenant.name}</h1><p>{solo ? 'Sua rotina, do primeiro horário ao último atendimento.' : 'Tudo o que você precisa para organizar os atendimentos e cuidar da barbearia.'}</p>{solo && <span className="dashboard-context">Atendimento com {setup?.soloProfessionalName}</span>}</div>{agenda && <a className="button" href={href + '/agenda'}>Abrir agenda <span aria-hidden="true">↗</span></a>}</section>
        {setup && (!setup.hasActiveServices || setup.activeProfessionalsCount === 0) && <aside className="dashboard-setup"><strong>Prepare sua agenda</strong><p>Cadastre os serviços e quem realiza os atendimentos. Depois, defina os horários de funcionamento para liberar as reservas.</p></aside>}
        {(!!routine.length || !!configuration.length) && <DashboardDirectory routine={routine} configuration={configuration} />}
        {!routine.length && !configuration.length && <section className="panel"><h2>Seu acesso está vinculado</h2><p>Peça ao responsável pela barbearia para conferir suas funções e liberar as áreas necessárias ao seu trabalho.</p></section>}
        <details className="dashboard-access"><summary>Seu acesso e recursos disponíveis</summary><p>Você acessa esta barbearia como <strong>{roleLabels[context.role] ?? context.role}</strong>.</p><ul className="feature-list">{features.filter(f => f.enabled).map(f => <li key={f.key}>{featureLabels[f.key] ?? f.key}<span>Ativo</span></li>)}</ul></details>
      </>}
    </main>{context && <DashboardNavigation slug={context.tenant.slug} agenda={agenda} customers={customers} />}<footer className="footer"><span>{name} · Área da barbearia</span><span>Uma rotina mais organizada.</span></footer>
  </div>;
}
