import { platformName } from '@platform/config';
import type { AppointmentDay, BookingOptions, ScheduleView } from '@platform/types';
import type { ContextView, FeatureView } from '@platform/web-kit';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { apiGet } from '@platform/web-kit/server';
import { localDate } from '../lib/booking-client';
import { AgendaManager } from './booking-agenda';
import { ScheduleManager } from './booking-schedule';
import './catalog.css';
import './booking.css';

export async function BookingPage({ slug, mode }: { slug: string; mode: 'agenda' | 'horarios' }) {
  const context = await apiGet<ContextView>(`/v1/tenants/${encodeURIComponent(slug)}/context`);
  const base = `/v1/tenants/${encodeURIComponent(context.tenant.slug)}`;
  const features = await apiGet<FeatureView[]>(`${base}/features`);
  const hasFeature = (key: string) => features.some(feature => feature.key === key && feature.enabled);
  const permission = (key: string) => context.permissions.includes(key);
  const allowed = hasFeature('booking') && permission('appointments.manage_all') && permission('appointments.read');
  const access = { create: permission('appointments.create'), update: permission('appointments.update'), schedules: permission('schedules.manage'), customersRead: hasFeature('customers') && permission('customers.read'), customersUpdate: hasFeature('customers') && permission('customers.update') };
  const canOpen = allowed && (mode === 'agenda' || access.schedules);
  const options = canOpen ? await apiGet<BookingOptions>(`${base}/booking/options`) : null;
  const first = options?.locations.find(location => location.active) ?? options?.locations[0];
  const date = first ? localDate(first.timezone) : '';
  const day = first && mode === 'agenda' ? await apiGet<AppointmentDay>(`${base}/appointments?${new URLSearchParams({ locationId: first.id, date })}`) : null;
  const schedule = first && mode === 'horarios' ? await apiGet<ScheduleView>(`${base}/schedule?${new URLSearchParams({ locationId: first.id })}`) : null;
  const name = platformName();
  const href = `/tenants/${encodeURIComponent(context.tenant.slug)}`;
  return <div className="shell catalog-shell booking-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a><SignOutButton /></header>
    <main className="main"><a className="catalog-back" href={`/?tenant=${encodeURIComponent(context.tenant.slug)}`}>← Voltar ao painel</a>
      <div className="intro"><span className="eyebrow">{context.tenant.name}</span><h1>{mode === 'agenda' ? 'Agenda' : 'Horários e bloqueios'}</h1><p>{mode === 'agenda' ? 'Acompanhe os atendimentos e reserve horários para seus clientes.' : 'Defina o expediente das unidades, a escala da equipe e os períodos indisponíveis.'}</p></div>
      <nav className="tenant-nav" aria-label="Gestão da barbearia">
        {allowed && hasFeature('whatsapp_automation') && <a href={`${href}/whatsapp`}>Confirmações por WhatsApp</a>}
        {permission('team.manage') && <a href={`${href}/locations`}>Unidades</a>}
        {allowed && <a href={`${href}/agenda`} aria-current={mode === 'agenda' ? 'page' : undefined}>Agenda</a>}
        {allowed && access.schedules && <a href={`${href}/horarios`} aria-current={mode === 'horarios' ? 'page' : undefined}>Horários e bloqueios</a>}
        {hasFeature('booking') && permission('services.manage') && <a href={`${href}/services`}>Serviços</a>}
        {hasFeature('booking') && permission('professionals.manage') && <a href={`${href}/professionals`}>Profissionais</a>}
      </nav>
      {!canOpen ? <section className="panel"><h2>Acesso indisponível</h2><p>Seu acesso e os recursos habilitados nesta barbearia não permitem abrir esta área. Consulte o responsável pelo ambiente.</p></section> : !options || !first ? <section className="panel"><h2>Nenhuma unidade disponível</h2><p>Uma unidade precisa estar cadastrada para organizar horários e atendimentos.</p></section> : mode === 'agenda' ? <AgendaManager slug={context.tenant.slug} options={options} initialDay={day!} initialLocationId={first.id} access={access} /> : <ScheduleManager slug={context.tenant.slug} options={options} initialSchedule={schedule!} />}
    </main><footer className="footer"><span>{name} · Área da barbearia</span><span>{context.tenant.name}</span></footer>
  </div>;
}
