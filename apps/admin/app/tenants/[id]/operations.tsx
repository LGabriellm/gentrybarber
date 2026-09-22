'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminTenantOperation } from './operations-actions';

type Location = { id: string; name: string; active: boolean };
type Service = { id: string; locationId: string; name: string; description: string | null; durationMinutes: number; priceCents: number; active: boolean; version: number };
type Professional = { id: string; locationId: string; name: string; bio: string | null; active: boolean; serviceIds: string[]; version: number };
type Window = { weekday: number; startMinute: number; endMinute: number };
export type Schedule = { location: Location & { timezone: string; version: number }; businessHours: Window[]; professionals: { id: string; name: string; active: boolean; windows: Window[] }[]; timeOffs: unknown[] };
export type ServiceCatalog = { items: Service[]; locations: Location[] };
export type ProfessionalCatalog = { items: Professional[]; locations: Location[]; services: { id: string; locationId: string; name: string; active: boolean }[] };
type DraftWindow = { weekday: number; start: string; end: string };
type ScheduleTarget = 'shared' | 'location' | `professional:${string}`;

const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minute = (value: string, end = false) => end && value === '24:00' ? 1440 : /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const draftWindows = (windows: Window[]): DraftWindow[] => windows.map(window => ({ weekday: window.weekday, start: clock(window.startMinute), end: clock(window.endMinute) }));
const sameWindows = (left: Window[], right: Window[]) => JSON.stringify(left) === JSON.stringify(right);
const defaultScheduleTarget = (schedule: Schedule | null): ScheduleTarget => !schedule || !schedule.professionals.some(professional => professional.windows.length) || schedule.professionals.every(professional => sameWindows(professional.windows, schedule.businessHours)) ? 'shared' : 'location';
const windowsForTarget = (schedule: Schedule | null, target: ScheduleTarget): Window[] => {
  if (!schedule || target === 'shared' || target === 'location') return schedule?.businessHours ?? [];
  return schedule.professionals.find(professional => `professional:${professional.id}` === target)?.windows ?? [];
};

export function TenantOperations({ tenantId, services, professionals, initialSchedule }: { tenantId: string; services: ServiceCatalog; professionals: ProfessionalCatalog; initialSchedule: Schedule | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget>(defaultScheduleTarget(initialSchedule));
  const [hours, setHours] = useState<DraftWindow[]>(draftWindows(windowsForTarget(initialSchedule, defaultScheduleTarget(initialSchedule))));
  const [scheduleConflict, setScheduleConflict] = useState(false);
  const scheduleDirty = useRef(false);
  const activeLocations = services.locations.filter(location => location.active);
  const [professionalLocation, setProfessionalLocation] = useState(activeLocations[0]?.id ?? '');
  useEffect(() => {
    const target = defaultScheduleTarget(initialSchedule);
    setSchedule(initialSchedule);
    if (!scheduleDirty.current) {
      setScheduleTarget(target);
      setHours(draftWindows(windowsForTarget(initialSchedule, target)));
      setScheduleConflict(false);
    }
  }, [initialSchedule]);
  async function mutate(path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown, success: string) {
    if (busy) return false;
    setBusy(true); setMessage(null);
    const result = await adminTenantOperation(tenantId, path, method, body);
    setMessage({ text: result.error ?? success, error: !!result.error });
    if (!result.error) router.refresh();
    setBusy(false); return !result.error;
  }
  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const price = String(form.get('price') ?? '').replace(',', '.');
    const ok = await mutate('services', 'POST', { locationId: form.get('locationId'), name: String(form.get('name') ?? '').trim(), description: String(form.get('description') ?? '').trim() || null, durationMinutes: Number(form.get('durationMinutes')), priceCents: Math.round(Number(price) * 100), active: true }, 'Serviço cadastrado.');
    if (ok) element.reset();
  }
  async function createProfessional(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const locationId = String(form.get('locationId') ?? '');
    const ok = await mutate('professionals', 'POST', { locationId, name: String(form.get('name') ?? '').trim(), bio: String(form.get('bio') ?? '').trim() || null, active: true, serviceIds: form.getAll('serviceIds').map(String) }, 'Profissional cadastrado.');
    if (ok) element.reset();
  }
  async function loadSchedule(locationId: string) {
    if (!locationId || busy) return;
    setBusy(true); setMessage(null);
    const result = await adminTenantOperation<Schedule>(tenantId, `schedule?locationId=${encodeURIComponent(locationId)}`);
    if (result.data) { const target = defaultScheduleTarget(result.data); scheduleDirty.current = false; setSchedule(result.data); setScheduleTarget(target); setHours(draftWindows(windowsForTarget(result.data, target))); setScheduleConflict(false); }
    setMessage(result.error ? { text: result.error, error: true } : null); setBusy(false);
  }
  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!schedule) return;
    const windows: Window[] = [];
    for (const window of hours) {
      const startMinute = minute(window.start); const endMinute = minute(window.end, true);
      if (startMinute === null || endMinute === null || endMinute <= startMinute) { setMessage({ text: `Revise o intervalo de ${weekdays[window.weekday]}.`, error: true }); return; }
      windows.push({ weekday: window.weekday, startMinute, endMinute });
    }
    windows.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
    if (windows.some((window, index) => index > 0 && window.weekday === windows[index - 1]!.weekday && window.startMinute < windows[index - 1]!.endMinute)) { setMessage({ text: 'Os intervalos do mesmo dia não podem se sobrepor.', error: true }); return; }
    setBusy(true);
    const professionalsPayload = scheduleTarget === 'shared'
      ? schedule.professionals.map(professional => ({ professionalId: professional.id, windows }))
      : scheduleTarget.startsWith('professional:')
        ? [{ professionalId: scheduleTarget.slice('professional:'.length), windows }]
        : [];
    const businessHours = scheduleTarget.startsWith('professional:') ? schedule.businessHours : windows;
    const result = await adminTenantOperation<Schedule>(tenantId, 'schedule', 'PUT', { locationId: schedule.location.id, expectedVersion: schedule.location.version, businessHours, professionals: professionalsPayload });
    setScheduleConflict(result.status === 409);
    setMessage({ text: result.error ?? (scheduleTarget === 'shared' ? 'Expediente da unidade e da equipe salvo.' : 'Expediente semanal salvo.'), error: !!result.error });
    if (result.data) { scheduleDirty.current = false; setSchedule(result.data); setHours(draftWindows(windowsForTarget(result.data, scheduleTarget))); }
    setBusy(false);
  }
  return <>
    {message && <p className={message.error ? 'admin-feedback' : 'admin-save-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <section id="servicos" className="admin-panel"><div className="admin-panel-heading"><div><h2>Serviços</h2><p>Catálogo, duração, preço e disponibilidade por unidade.</p></div><span>{services.items.length} cadastrados</span></div><form className="admin-form" noValidate onSubmit={createService}><fieldset disabled={busy || !activeLocations.length}><div className="admin-form-grid"><label>Unidade<select name="locationId" required defaultValue=""><option value="" disabled>Selecione</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Nome do serviço<input name="name" required maxLength={120} /></label><label>Preço (R$)<input name="price" inputMode="decimal" placeholder="45,00" required /></label><label>Duração em minutos<input name="durationMinutes" type="number" min={1} max={1440} required /></label><label className="admin-wide-field">Descrição<textarea name="description" rows={3} maxLength={2000} /></label></div></fieldset><div className="admin-form-actions"><button className="button" disabled={busy || !activeLocations.length}>Adicionar serviço</button></div></form>{services.items.length ? <div className="admin-operation-grid">{services.items.map(service => <article className="admin-location-card" key={service.id}><div><h3>{service.name}</h3><span className={`admin-status ${service.active ? '' : 'admin-status-muted'}`}>{service.active ? 'Ativo' : 'Inativo'}</span></div><p>{money(service.priceCents)} · {service.durationMinutes} minutos · {services.locations.find(location => location.id === service.locationId)?.name}</p><button type="button" className="button secondary" disabled={busy} onClick={() => mutate(`services/${service.id}`, 'PATCH', { name: service.name, description: service.description, durationMinutes: service.durationMinutes, priceCents: service.priceCents, active: !service.active, expectedVersion: service.version }, service.active ? 'Serviço desativado.' : 'Serviço reativado.')}>{service.active ? 'Desativar' : 'Reativar'}</button></article>)}</div> : <p className="admin-empty">Nenhum serviço cadastrado.</p>}</section>
    <section id="profissionais" className="admin-panel"><div className="admin-panel-heading"><div><h2>Profissionais</h2><p>Equipe e serviços realizados em cada unidade.</p></div><span>{professionals.items.length} cadastrados</span></div><form className="admin-form" noValidate onSubmit={createProfessional}><fieldset disabled={busy || !activeLocations.length}><div className="admin-form-grid"><label>Unidade<select name="locationId" required value={professionalLocation} onChange={event => setProfessionalLocation(event.target.value)}><option value="" disabled>Selecione</option>{activeLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label>Nome do profissional<input name="name" required maxLength={120} /></label><label className="admin-wide-field">Apresentação<textarea name="bio" rows={3} maxLength={2000} /></label></div><fieldset className="admin-check-grid"><legend>Serviços realizados</legend>{professionals.services.filter(service => service.locationId === professionalLocation).map(service => <label className="admin-checkbox" key={service.id}><input type="checkbox" name="serviceIds" value={service.id} />{service.name}</label>)}</fieldset></fieldset><div className="admin-form-actions"><button className="button" disabled={busy || !activeLocations.length}>Adicionar profissional</button></div></form>{professionals.items.length ? <div className="admin-operation-grid">{professionals.items.map(professional => <article className="admin-location-card" key={professional.id}><div><h3>{professional.name}</h3><span className={`admin-status ${professional.active ? '' : 'admin-status-muted'}`}>{professional.active ? 'Ativo' : 'Inativo'}</span></div><p>{professional.bio || 'Sem apresentação'} · {professional.serviceIds.length} serviços</p><button type="button" className="button secondary" disabled={busy} onClick={() => mutate(`professionals/${professional.id}`, 'PATCH', { name: professional.name, bio: professional.bio, active: !professional.active, serviceIds: professional.serviceIds, expectedVersion: professional.version }, professional.active ? 'Profissional desativado.' : 'Profissional reativado.')}>{professional.active ? 'Desativar' : 'Reativar'}</button></article>)}</div> : <p className="admin-empty">Nenhum profissional cadastrado.</p>}</section>
    <section id="horarios" className="admin-panel">
      <div className="admin-panel-heading">
        <div><h2>Expediente semanal</h2><p>Configure a unidade e a escala usada para calcular os horários disponíveis.</p></div>
        {services.locations.length > 1 && <label>Unidade<select value={schedule?.location.id ?? ''} disabled={busy} onChange={event => loadSchedule(event.target.value)}>{services.locations.map(location => <option key={location.id} value={location.id}>{location.name}{location.active ? '' : ' (inativa)'}</option>)}</select></label>}
      </div>
      {schedule ? <form className="admin-form" noValidate onSubmit={saveSchedule}>
        <fieldset disabled={busy}>
          <div className="admin-schedule-scope">
            <label>Aplicar horários a<select value={scheduleTarget} onChange={event => { const target = event.target.value as ScheduleTarget; scheduleDirty.current = true; setScheduleTarget(target); setHours(draftWindows(windowsForTarget(schedule, target))); setScheduleConflict(false); setMessage(null); }}><option value="shared">Unidade e toda a equipe</option><option value="location">Somente expediente da unidade</option>{schedule.professionals.map(professional => <option key={professional.id} value={`professional:${professional.id}`}>Somente {professional.name}{professional.active ? '' : ' (inativo)'}</option>)}</select></label>
            <p>{scheduleTarget === 'shared' ? 'Recomendado: mantém a unidade e todos os profissionais com a mesma disponibilidade.' : scheduleTarget === 'location' ? 'Use este modo quando cada profissional já possui uma escala própria.' : 'Altera apenas a escala deste profissional, sem substituir o expediente da unidade.'}</p>
          </div>
          <div className="admin-hours-grid">{hours.map((window, index) => <div className="admin-hours-row" key={`${schedule.location.id}-${scheduleTarget}-${index}`}><label>Dia<select value={window.weekday} onChange={event => { scheduleDirty.current = true; setHours(previous => previous.map((item, position) => position === index ? { ...item, weekday: Number(event.target.value) } : item)); }}>{weekdays.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}</select></label><label>Abre<input value={window.start} inputMode="numeric" maxLength={5} placeholder="09:00" onChange={event => { scheduleDirty.current = true; setHours(previous => previous.map((item, position) => position === index ? { ...item, start: event.target.value } : item)); }} /></label><label>Fecha<input value={window.end} inputMode="numeric" maxLength={5} placeholder="18:00" onChange={event => { scheduleDirty.current = true; setHours(previous => previous.map((item, position) => position === index ? { ...item, end: event.target.value } : item)); }} /></label><button type="button" className="button secondary" aria-label={`Remover intervalo ${index + 1}`} onClick={() => { scheduleDirty.current = true; setHours(previous => previous.filter((_, position) => position !== index)); }}>Remover</button></div>)}</div>
          {!hours.length && <p className="admin-empty">Nenhum intervalo: este expediente ficará sem disponibilidade.</p>}
          <button type="button" className="button secondary" disabled={hours.length >= 28} onClick={() => { scheduleDirty.current = true; setHours(previous => [...previous, { weekday: 1, start: '09:00', end: '18:00' }]); }}>Adicionar intervalo</button>
        </fieldset>
        {scheduleConflict && <div className="admin-conflict-recovery" role="alert"><span>Os horários mudaram ou existem reservas futuras incompatíveis.</span><button type="button" className="button secondary" onClick={() => loadSchedule(schedule.location.id)}>Recarregar horários</button></div>}
        <div className="admin-form-actions"><span>Fuso: {schedule.location.timezone}. Reservas futuras nunca são invalidadas silenciosamente.</span><button className="button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar expediente'}</button></div>
      </form> : <p className="admin-empty">Cadastre uma unidade para definir horários.</p>}
    </section>
  </>;
}
