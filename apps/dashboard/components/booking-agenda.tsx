'use client';
import { useEffect, useRef, useState } from 'react';
import type { AppointmentDay, AppointmentStatusView, AppointmentView, BookingOptions } from '@platform/types';
import { appointmentTime, localDate, operation, OperationError, statusLabels, transitions } from '../lib/booking-client';
import type { BookingAccess } from '../lib/booking-client';
import { formatPrice } from '../lib/catalog-format';
import { CreateBooking } from './booking-create';
import { RescheduleBooking } from './booking-reschedule';
import { BookingFeedback } from './booking-common';
import type { BookingMessage } from './booking-common';

export function AgendaManager({ slug, options, initialDay, initialLocationId, access }: { slug: string; options: BookingOptions; initialDay: AppointmentDay; initialLocationId: string; access: BookingAccess }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [catalog, setCatalog] = useState(options);
  const [locationId, setLocationId] = useState(initialLocationId);
  const [date, setDate] = useState(initialDay.date);
  const [day, setDay] = useState<AppointmentDay | null>(initialDay);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [stale, setStale] = useState(false);
  const [editor, setEditor] = useState<'new' | AppointmentView | null>(null);
  const [message, setMessage] = useState<BookingMessage | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const editorRef = useRef<HTMLElement>(null);
  const location = catalog.locations.find(item => item.id === locationId);
  const blocked = !ready || busy || locked || stale || !day;
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = (day?.items ?? []).filter(item =>
    (statusFilter === 'all' || item.status === statusFilter) &&
    normalize(`${item.customer.name} ${item.customer.phone} ${item.professionalName}`).includes(normalize(search.trim()))
  ).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  function changeDay(offset: number) {
    if (!date) return;
    const target = new Date(`${date}T12:00:00Z`);
    target.setUTCDate(target.getUTCDate() + offset);
    void load(locationId, target.toISOString().slice(0, 10));
  }

  async function load(targetLocation = locationId, targetDate = date, success?: string) {
    if (!ready || !targetLocation || !targetDate || busy || locked) return;
    setBusy(true); setMessage(null);
    try {
      const [freshOptions, freshDay] = await Promise.all([
        operation<BookingOptions>(slug, 'booking/options'),
        operation<AppointmentDay>(slug, `appointments?${new URLSearchParams({ locationId: targetLocation, date: targetDate })}`),
      ]);
      setCatalog(freshOptions); setDay(freshDay); setLocationId(targetLocation); setDate(targetDate); setEditor(null); setStale(false);
      setMessage({ text: success || 'Agenda atualizada.' });
    } catch (error) {
      setStale(true);
      setMessage({ text: `${success ? success + ' A lista não pôde ser atualizada. ' : ''}${error instanceof Error ? error.message : 'Não foi possível carregar a agenda.'}`, error: true, signIn: error instanceof OperationError && error.status === 401 });
    } finally { setBusy(false); }
  }
  function open(entry: 'new' | AppointmentView) {
    setEditor(entry); setMessage(null);
    requestAnimationFrame(() => { editorRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); editorRef.current?.focus(); });
  }
  function saved(appointment: AppointmentView) {
    const targetDate = localDate(location!.timezone, new Date(appointment.startsAt));
    setEditor(null); setDay(previous => previous ? { ...previous, date: targetDate, items: [appointment] } : null);
    setLocationId(appointment.locationId); setDate(targetDate);
    // Child requests unlock before this callback; use a fresh load on the next paint.
    requestAnimationFrame(() => { void refreshAfterSave(appointment.locationId, targetDate); });
  }
  async function refreshAfterSave(targetLocation: string, targetDate: string) {
    setBusy(true); setLocked(false); setMessage({ text: 'Agendamento salvo. Atualizando a agenda…' });
    try {
      const fresh = await operation<AppointmentDay>(slug, `appointments?${new URLSearchParams({ locationId: targetLocation, date: targetDate })}`);
      setDay(fresh); setStale(false); setMessage({ text: 'Agendamento salvo e agenda atualizada.' });
    } catch { setStale(true); setMessage({ text: 'O agendamento foi salvo, mas a lista não pôde ser atualizada. Recarregue a agenda.', error: true }); }
    finally { setBusy(false); }
  }
  async function updateStatus(appointment: AppointmentView, status: AppointmentStatusView, reason: string | null) {
    if (blocked) return;
    setBusy(true); setMessage(null);
    try {
      const updated = await operation<AppointmentView>(slug, `appointments/${encodeURIComponent(appointment.id)}/status`, 'POST', { status, expectedVersion: appointment.version, reason });
      setDay(previous => previous ? { ...previous, items: previous.items.map(item => item.id === updated.id ? updated : item) } : null);
      setMessage({ text: `Atendimento atualizado: ${statusLabels[updated.status]}.` });
    } catch (error) {
      if (!(error instanceof OperationError) || error.status === 0 || error.status >= 500 || error.status === 409 || error.status === 404) setStale(true);
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível confirmar a atualização. Recarregue a agenda.', error: true, signIn: error instanceof OperationError && error.status === 401 });
    } finally { setBusy(false); }
  }

  return <div className="booking-agenda" aria-busy={busy}>
    <form className="booking-toolbar" onSubmit={event => { event.preventDefault(); void load(); }}>
      {catalog.locations.length > 1 ? <label className="catalog-field">Unidade da agenda<select value={locationId} disabled={!ready || busy || locked} onChange={event => { const newLocation = event.target.value; const target = catalog.locations.find(item => item.id === newLocation); setLocationId(newLocation); const newDate = target ? localDate(target.timezone) : ''; setDate(newDate); setDay(null); setEditor(null); setMessage(null); if (newLocation && newDate) void load(newLocation, newDate); }} >{catalog.locations.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inativa)'}</option>)}</select></label> : <p className="booking-choice-summary"><span>Agenda de</span><strong>{location?.name}</strong></p>}
      <label className="catalog-field">Data da agenda<input type="date" value={date} required disabled={!ready || busy || locked} onChange={event => { const newDate = event.target.value; setDate(newDate); setDay(null); setEditor(null); setMessage(null); if (locationId && newDate) void load(locationId, newDate); }} /></label>
      <button type="submit" className="button secondary" disabled={!ready || busy || locked || !date}>{busy ? 'Carregando…' : 'Recarregar agenda'}</button>
      {access.create && access.customersRead && <button type="button" className="button" disabled={blocked || !location?.active} onClick={() => open('new')}>Novo agendamento</button>}
    </form>
    <div className="booking-date-navigation" aria-label="Navegar entre datas">
      <button type="button" className="button secondary" disabled={!ready || busy || locked || !date} onClick={() => changeDay(-1)} aria-label="Dia anterior">← Anterior</button>
      <button type="button" className="button secondary" disabled={!ready || busy || locked || !location} onClick={() => location && void load(locationId, localDate(location.timezone))}>Hoje</button>
      <button type="button" className="button secondary" disabled={!ready || busy || locked || !date} onClick={() => changeDay(1)} aria-label="Próximo dia">Próximo →</button>
    </div>
    {location && <p className="booking-zone">Horários locais de {location.name} · {location.timezone}</p>}
    {access.create && !access.customersRead && <p className="notice">Para criar agendamentos, o acesso aos clientes precisa estar habilitado neste ambiente.</p>}
    {!location?.active && <p className="notice">Esta unidade está inativa. Consulte os registros existentes; novos agendamentos exigem uma unidade ativa.</p>}
    {day && <div className="booking-day-summary" aria-label="Resumo da agenda"><div><span>Agendados</span><strong>{day.items.filter(item => ['PENDING', 'CONFIRMED'].includes(item.status)).length}</strong></div><div><span>Em atendimento</span><strong>{day.items.filter(item => ['CHECKED_IN', 'IN_PROGRESS'].includes(item.status)).length}</strong></div><div><span>Concluídos</span><strong>{day.items.filter(item => item.status === 'COMPLETED').length}</strong></div></div>}<BookingFeedback message={message} />
    {stale && <p className="notice">As ações ficam pausadas até você recarregar a agenda e conferir os dados atuais.</p>}
    {editor && location && <section ref={editorRef} tabIndex={-1} className="panel catalog-editor booking-editor" aria-label={editor === 'new' ? 'Novo agendamento' : 'Reagendar atendimento'}>
      <div className="section-heading"><h2>{editor === 'new' ? 'Novo agendamento' : 'Reagendar atendimento'}</h2><button type="button" className="button secondary" disabled={locked || busy} onClick={() => setEditor(null)}>Fechar formulário</button></div>
      {editor === 'new' ? <CreateBooking key={`new-${location.id}`} slug={slug} location={location} options={catalog} initialDate={date} access={access} onSaved={saved} onLock={setLocked} /> : <RescheduleBooking key={`${editor.id}-${editor.version}`} slug={slug} appointment={editor} location={location} onSaved={saved} onStale={() => setStale(true)} onLock={setLocked} disabled={stale} />}
    </section>}
    {!day ? <section className="panel catalog-empty"><h2>Consulte os atendimentos</h2><p>Use “Recarregar agenda” para consultar os atendimentos.</p></section> : <section className="booking-day" aria-label="Atendimentos do dia"><div className="catalog-list-heading"><h2>{day.date.split('-').reverse().join('/')}</h2><span>{day.items.length} {day.items.length === 1 ? 'atendimento' : 'atendimentos'}</span></div>
      {!!day.items.length && <div className="booking-list-filters"><label className="catalog-field">Buscar na agenda<input type="search" placeholder="Cliente, telefone ou profissional" value={search} onChange={event => setSearch(event.target.value)} /></label><label className="catalog-field">Situação<select aria-label="Situação" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Todos os atendimentos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p aria-live="polite">{filtered.length} de {day.items.length} atendimentos</p></div>}
      {!!day.items.length && !filtered.length && <div className="panel catalog-empty"><h3>Nenhum atendimento com estes filtros.</h3><button className="button secondary" type="button" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Limpar filtros</button></div>}
      {day.items.length ? <div className="booking-appointments">{filtered.map(appointment => <article className="card booking-appointment" key={appointment.id} aria-label={`Atendimento de ${appointment.customer.name}`}>
        <div className="booking-appointment-head"><div><span className="booking-time">{appointmentTime(appointment.startsAt, day.timezone)}</span><span className="booking-end">até {appointmentTime(appointment.endsAt, day.timezone)}</span></div><span className={`booking-status booking-status-${appointment.status}`}>{statusLabels[appointment.status]}</span></div>
        <h3>{appointment.customer.name}</h3><p className="booking-contact">{appointment.customer.phone} · {appointment.professionalName}</p>
        <ul className="booking-snapshot">{appointment.services.map(service => <li key={service.serviceId}><span>{service.name}</span><span>{service.durationMinutes} min · {formatPrice(service.priceCents)}</span></li>)}</ul><p className="booking-total">Total contratado <strong>{formatPrice(appointment.totalCents)}</strong></p>
        {appointment.notes && <p className="catalog-description">{appointment.notes}</p>}
        {access.update && <><AppointmentStatusForm key={`${appointment.id}-${appointment.version}`} appointment={appointment} disabled={blocked} onSubmit={updateStatus} />{appointment.status === 'CONFIRMED' && new Date(appointment.startsAt).getTime() > Date.now() && <button type="button" className="button secondary booking-reschedule" aria-label={`Reagendar ${appointment.customer.name}`} disabled={blocked} onClick={() => open(appointment)}>Reagendar</button>}</>}
      </article>)}</div> : <div className="panel catalog-empty"><h3>Nenhum atendimento nesta data.</h3><p>{access.create && access.customersRead ? 'Use “Novo agendamento” para reservar um horário disponível.' : 'Os atendimentos aparecerão aqui quando forem cadastrados.'}</p></div>}
    </section>}
  </div>;
}

function AppointmentStatusForm({ appointment, disabled, onSubmit }: { appointment: AppointmentView; disabled: boolean; onSubmit: (appointment: AppointmentView, status: AppointmentStatusView, reason: string | null) => Promise<void> }) {
  const allowed = transitions(appointment.status, appointment.startsAt);
  if (!allowed.length) return null;

  const primaryMap: Partial<Record<AppointmentStatusView, AppointmentStatusView>> = {
    CONFIRMED: 'CHECKED_IN',
    CHECKED_IN: 'IN_PROGRESS',
    IN_PROGRESS: 'COMPLETED'
  };
  const primaryAction = primaryMap[appointment.status];

  const actionLabels: Record<string, string> = {
    CHECKED_IN: 'Cliente chegou',
    IN_PROGRESS: 'Iniciar atendimento',
    COMPLETED: 'Finalizar atendimento',
    CANCELED: 'Cancelar',
    NO_SHOW: 'Não compareceu'
  };

  function handleAction(status: AppointmentStatusView) {
    if (disabled) return;
    let reason: string | null = null;
    if (status === 'CANCELED' || status === 'NO_SHOW') {
      const input = window.prompt(`Motivo para marcar como ${statusLabels[status].toLowerCase()}? (opcional)`);
      if (input === null) return;
      reason = input.trim() || null;
    }
    void onSubmit(appointment, status, reason);
  }

  return <div className="booking-status-form" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
    {allowed.map(status => (
      <button
        key={status}
        type="button"
        className={`button ${status === primaryAction ? '' : 'secondary'}`}
        disabled={disabled}
        onClick={() => handleAction(status)}
        aria-label={`${actionLabels[status] || statusLabels[status]} para ${appointment.customer.name}`}
      >
        {actionLabels[status] || statusLabels[status]}
      </button>
    ))}
  </div>;
}
