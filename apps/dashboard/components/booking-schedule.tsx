'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { localDateTimeToInstant } from '@platform/booking';
import type { BookingOptions, ScheduleView, UpdateScheduleInput, WeeklyWindow } from '@platform/types';
import { appointmentTime, operation, OperationError } from '../lib/booking-client';
import { BookingFeedback } from './booking-common';
import type { BookingMessage } from './booking-common';

const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
type DraftWindow = { weekday: number; start: string; end: string };
function clockTime(minute: number): string { return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`; }
function parseClock(value: string, allowMidnightEnd = false): number | null {
  if (allowMidnightEnd && value === '24:00') return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}
function draft(windows: WeeklyWindow[]): DraftWindow[] { return windows.map(window => ({ weekday: window.weekday, start: clockTime(window.startMinute), end: clockTime(window.endMinute) })); }

export function ScheduleManager({ slug, options, initialSchedule }: { slug: string; options: BookingOptions; initialSchedule: ScheduleView }) {
  const [locationId, setLocationId] = useState(initialSchedule.location.id);
  const [schedule, setSchedule] = useState<ScheduleView | null>(initialSchedule);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState<BookingMessage | null>(null);
  async function reload(targetLocation = locationId) {
    if (busy || !targetLocation) return;
    setBusy(true); setMessage(null);
    try { setSchedule(await operation<ScheduleView>(slug, `schedule?${new URLSearchParams({ locationId: targetLocation })}`)); setStale(false); setMessage({ text: 'Horários e bloqueios atualizados.' }); }
    catch (error) { setStale(true); setMessage({ text: error instanceof Error ? error.message : 'Não foi possível carregar os horários.', error: true, signIn: error instanceof OperationError && error.status === 401 }); }
    finally { setBusy(false); }
  }
  async function write(path: string, method: string, body: unknown, success: string) {
    if (busy || stale || !schedule) return;
    setBusy(true); setMessage(null);
    let saved = false;
    try {
      if (path === 'schedule') { setSchedule(await operation<ScheduleView>(slug, path, method, body)); }
      else { await operation(slug, path, method, body); saved = true; setSchedule(await operation<ScheduleView>(slug, `schedule?${new URLSearchParams({ locationId })}`)); }
      setStale(false); setMessage({ text: success });
    } catch (error) {
      if (saved || !(error instanceof OperationError) || error.status === 0 || error.status >= 500 || error.status === 409 || error.status === 404) setStale(true);
      setMessage({ text: saved ? 'A alteração foi salva, mas não foi possível atualizar a tela. Recarregue os horários.' : error instanceof OperationError && error.status === 409 ? 'Os horários mudaram ou a alteração conflita com atendimentos existentes. Recarregue os dados e revise o período.' : error instanceof Error ? error.message : 'Não foi possível confirmar a operação. Recarregue os horários.', error: true, signIn: error instanceof OperationError && error.status === 401 });
    } finally { setBusy(false); }
  }
  return <div className="booking-schedules" aria-busy={busy}>
    <form className="booking-toolbar" onSubmit={event => { event.preventDefault(); void reload(); }}>{options.locations.length > 1 ? <label className="catalog-field">Unidade dos horários<select value={locationId} disabled={busy} onChange={event => { const newLoc = event.target.value; setLocationId(newLoc); setSchedule(null); setMessage(null); void reload(newLoc); }}>{options.locations.map(location => <option key={location.id} value={location.id}>{location.name}{location.active ? '' : ' (inativa)'}</option>)}</select></label> : <p className="booking-choice-summary"><strong>{options.locations[0]?.name}</strong></p>}<button type="submit" className="button secondary" disabled={busy}>{busy ? 'Carregando…' : 'Recarregar horários'}</button></form>
    <BookingFeedback message={message} />
    {stale && <p className="notice">Recarregue os horários para conferir os dados atuais antes de fazer outra alteração.</p>}
    {!schedule ? <section className="panel catalog-empty"><h2>Escolha uma unidade</h2><p>Use “Recarregar horários” para consultar o expediente e os bloqueios.</p></section> : <>
      <p className="booking-zone">Unidade: <strong>{schedule.location.name}</strong> · Fuso: <strong>{schedule.location.timezone}</strong>. Informe todos os horários no fuso desta unidade.</p>
      <section className="panel"><h2>Expediente e escala semanal</h2><p>Um horário livre precisa estar dentro do expediente da unidade e da escala do profissional. Cadastre intervalos separados para representar pausas.</p><WeeklyScheduleEditor key={`${schedule.location.id}-${schedule.location.version}`} schedule={schedule} disabled={busy || stale} onInvalid={text => setMessage({ text, error: true })} onSave={input => write('schedule', 'PUT', input, 'Horários semanais salvos.')} /></section>
      <section className="panel"><h2>Novo bloqueio</h2><p>Use bloqueios para férias, feriados ou indisponibilidades pontuais. O período não pode sobrepor um atendimento reservado.</p><TimeOffEditor key={`timeoff-${schedule.location.id}-${schedule.location.version}`} schedule={schedule} disabled={busy || stale} onInvalid={text => setMessage({ text, error: true })} onSave={input => write('time-offs', 'POST', input, 'Bloqueio cadastrado.')} /></section>
      <section className="panel"><div className="section-heading"><h2>Bloqueios cadastrados</h2><span>{schedule.timeOffs.length}</span></div>{schedule.timeOffs.length ? <ul className="booking-timeoffs">{schedule.timeOffs.map(timeOff => <li key={timeOff.id}><div><strong>{timeOff.professionalId ? schedule.professionals.find(professional => professional.id === timeOff.professionalId)?.name || 'Profissional' : 'Toda a unidade'}</strong><p>{appointmentTime(timeOff.startsAt, schedule.location.timezone, true)}<br />até {appointmentTime(timeOff.endsAt, schedule.location.timezone, true)}</p>{timeOff.reason && <p className="catalog-description">{timeOff.reason}</p>}</div><button type="button" className="button secondary" aria-label={`Remover bloqueio de ${timeOff.professionalId ? schedule.professionals.find(professional => professional.id === timeOff.professionalId)?.name || 'profissional' : 'toda a unidade'} em ${appointmentTime(timeOff.startsAt, schedule.location.timezone, true)}`} disabled={busy || stale} onClick={() => write(`time-offs/${encodeURIComponent(timeOff.id)}`, 'DELETE', {}, 'Bloqueio removido.')}>Remover bloqueio</button></li>)}</ul> : <p>Nenhum bloqueio cadastrado nesta unidade.</p>}</section>
    </>}
  </div>;
}

function WeeklyScheduleEditor({ schedule, disabled, onInvalid, onSave }: { schedule: ScheduleView; disabled: boolean; onInvalid: (text: string) => void; onSave: (input: UpdateScheduleInput) => Promise<void> }) {
  const solo = schedule.professionals.length === 1 && schedule.professionals[0]?.active ? schedule.professionals[0] : undefined;
  const [shared, setShared] = useState(!!solo && (!solo.windows.length || JSON.stringify(solo.windows) === JSON.stringify(schedule.businessHours)));
  const [target, setTarget] = useState('');
  const [windows, setWindows] = useState<DraftWindow[]>(draft(schedule.businessHours));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled) return;
    const parsed: WeeklyWindow[] = [];
    for (const window of windows) {
      const startMinute = parseClock(window.start);
      const endMinute = parseClock(window.end, true);
      if (startMinute === null || endMinute === null || endMinute <= startMinute || !Number.isInteger(window.weekday) || window.weekday < 0 || window.weekday > 6) { onInvalid('Informe horários no formato HH:MM, com o fim após o início. O final do dia pode ser 24:00.'); return; }
      parsed.push({ weekday: window.weekday, startMinute, endMinute });
    }
    const sorted = parsed.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
    if (sorted.length > 28 || sorted.some((window, index) => index > 0 && window.weekday === sorted[index - 1]!.weekday && window.startMinute < sorted[index - 1]!.endMinute)) { onInvalid('Cadastre no máximo 28 intervalos, sem sobreposição no mesmo dia.'); return; }
    await onSave({ locationId: schedule.location.id, expectedVersion: schedule.location.version, businessHours: shared || !target ? sorted : schedule.businessHours, professionals: shared && solo ? [{ professionalId: solo.id, windows: sorted }] : target ? [{ professionalId: target, windows: sorted }] : [] });
  }
  return <form className="catalog-form" onSubmit={submit}><fieldset className="catalog-fields" disabled={disabled}>
    {solo && <label className="catalog-checkbox"><input type="checkbox" checked={shared} onChange={event => { setShared(event.target.checked); setTarget(''); setWindows(draft(schedule.businessHours)); }} />Usar o mesmo horário para a barbearia e {solo.name}</label>}
    {shared ? <p className="notice">Defina sua semana uma vez. Ao salvar, estes horários serão aplicados à barbearia e a {solo?.name}, incluindo as pausas.</p> : <><label className="catalog-field">Editar horários de<select value={target} onChange={event => { const id = event.target.value; setTarget(id); setWindows(draft(id ? schedule.professionals.find(professional => professional.id === id)?.windows || [] : schedule.businessHours)); }}><option value="">Expediente da unidade</option>{schedule.professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}{professional.active ? '' : ' (inativo)'}</option>)}</select></label>{solo && <p className="catalog-note">Os horários da barbearia e do profissional podem ser diferentes. Ative a opção acima se quiser unificá-los.</p>}</>}
    <div className="booking-weekly-windows">{windows.map((window, index) => <div className="booking-weekly-row" key={index}><label className="catalog-field">Dia do intervalo {index + 1}<select value={window.weekday} onChange={event => setWindows(previous => previous.map((item, position) => position === index ? { ...item, weekday: Number(event.target.value) } : item))}>{weekdays.map((day, weekday) => <option key={day} value={weekday}>{day}</option>)}</select></label><label className="catalog-field">Início do intervalo {index + 1}<input value={window.start} placeholder="09:00" inputMode="numeric" maxLength={5} required onChange={event => setWindows(previous => previous.map((item, position) => position === index ? { ...item, start: event.target.value } : item))} /></label><label className="catalog-field">Fim do intervalo {index + 1}<input value={window.end} placeholder="18:00" inputMode="numeric" maxLength={5} required onChange={event => setWindows(previous => previous.map((item, position) => position === index ? { ...item, end: event.target.value } : item))} /></label><button type="button" className="catalog-text-button" aria-label={`Remover intervalo ${index + 1}`} onClick={() => setWindows(previous => previous.filter((_, position) => position !== index))}>Remover</button></div>)}</div>
    {!windows.length && <p className="notice">Nenhum intervalo semanal. {target ? 'Este profissional' : 'Esta unidade'} ficará sem disponibilidade até você cadastrar horários.</p>}
    <div className="catalog-actions"><button type="button" className="button secondary" disabled={windows.length >= 28} onClick={() => setWindows(previous => [...previous, { weekday: 1, start: '09:00', end: '18:00' }])}>Adicionar intervalo</button><button type="submit" className="button">Salvar horários</button></div><p className="catalog-note">Até 28 intervalos por configuração. Alterações não podem invalidar atendimentos futuros já reservados.</p>
  </fieldset></form>;
}

function TimeOffEditor({ schedule, disabled, onInvalid, onSave }: { schedule: ScheduleView; disabled: boolean; onInvalid: (text: string) => void; onSave: (input: { locationId: string; professionalId: string | null; startsAt: string; endsAt: string; reason: string | null }) => Promise<void> }) {
  const solo = schedule.professionals.length === 1 && schedule.professionals[0]?.active ? schedule.professionals[0] : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = new FormData(event.currentTarget);
    let startsAt: string;
    let endsAt: string;
    try {
      function instant(value: string): string {
        const [date = '', time = ''] = value.split('T');
        const minute = parseClock(time);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minute === null) throw new Error('INVALID_LOCAL_TIME');
        return localDateTimeToInstant(date, minute, schedule.location.timezone);
      }
      startsAt = instant(String(form.get('startsAt') || ''));
      endsAt = instant(String(form.get('endsAt') || ''));
    } catch { onInvalid('O horário local informado é inválido ou ambíguo neste fuso. Em uma mudança de horário de verão, escolha um horário fora do período de transição.'); return; }
    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();
    if (start <= Date.now() || end <= start || end - start > 366 * 24 * 60 * 60 * 1000) { onInvalid('O bloqueio precisa começar no futuro, terminar após o início e durar no máximo 366 dias.'); return; }
    await onSave({ locationId: schedule.location.id, professionalId: String(form.get('professionalId') || '') || null, startsAt, endsAt, reason: String(form.get('reason') || '').trim() || null });
  }
  return <form className="catalog-form" onSubmit={submit}><fieldset className="catalog-fields" disabled={disabled}>{solo ? <><input type="hidden" name="professionalId" value={solo.id} /><p>Pausar os atendimentos de <strong>{solo.name}</strong> neste período.</p></> : <label className="catalog-field">Bloquear para<select name="professionalId"><option value="">Toda a unidade</option>{schedule.professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}{professional.active ? '' : ' (inativo)'}</option>)}</select></label>}<div className="catalog-form-grid"><label className="catalog-field">Início do bloqueio<input type="datetime-local" name="startsAt" required step={60} /><small>Horário local de {schedule.location.timezone}.</small></label><label className="catalog-field">Fim do bloqueio<input type="datetime-local" name="endsAt" required step={60} /><small>Horário local de {schedule.location.timezone}.</small></label></div><label className="catalog-field">Motivo do bloqueio<textarea name="reason" maxLength={500} rows={3} /><small>Opcional. Até 500 caracteres.</small></label><button type="submit" className="button">Salvar bloqueio</button></fieldset></form>;
}
