'use client';
import { useState } from 'react';
import type { AppointmentView, AvailabilityView, BookingLocation, BookingOptions, CreateAppointmentInput, CustomerView } from '@platform/types';
import { appointmentTime, localDate, operation, OperationError } from '../lib/booking-client';
import type { BookingAccess } from '../lib/booking-client';
import { formatPrice } from '../lib/catalog-format';
import { BookingFeedback } from './booking-common';
import type { BookingMessage } from './booking-common';
import { CustomerPicker } from './booking-customer';

export function CreateBooking({ slug, location, options, initialDate, access, onSaved, onLock }: { slug: string; location: BookingLocation; options: BookingOptions; initialDate: string; access: BookingAccess; onSaved: (appointment: AppointmentView) => void; onLock: (locked: boolean) => void }) {
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState('');
  const [date, setDate] = useState(initialDate);
  const [customer, setCustomer] = useState<CustomerView | null>(null);
  const [notes, setNotes] = useState('');
  const [availability, setAvailability] = useState<AvailabilityView | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<CreateAppointmentInput | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState<BookingMessage | null>(null);
  const services = options.services.filter(service => service.locationId === location.id && service.active);
  const professionals = options.professionals.filter(professional => professional.locationId === location.id && professional.active && serviceIds.every(id => professional.serviceIds.includes(id)));
  const locked = busy || uncertain;
  function resetSlots() { setAvailability(null); setStartsAt(''); setMessage(null); }

  async function findSlots() {
    if (locked) return;
    if (!professionalId || !serviceIds.length || serviceIds.length > 10 || !date) { setMessage({ text: 'Selecione de 1 a 10 serviços, um profissional e a data.', error: true }); return; }
    setBusy(true); setMessage(null); setStartsAt(''); setAvailability(null); onLock(true);
    try { setAvailability(await operation<AvailabilityView>(slug, `availability?${new URLSearchParams({ locationId: location.id, professionalId, serviceIds: [...serviceIds].sort().join(','), date })}`)); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Não foi possível consultar os horários.', error: true, signIn: error instanceof OperationError && error.status === 401 }); }
    finally { setBusy(false); onLock(false); }
  }
  async function confirm() {
    if (busy) return;
    if (!attempt && (!customer || !startsAt || !availability || !professionalId)) { setMessage({ text: 'Selecione o cliente e um horário disponível antes de confirmar.', error: true }); return; }
    const payload = attempt ?? { locationId: location.id, professionalId, customerId: customer!.id, serviceIds: [...serviceIds].sort(), startsAt, notes: notes.trim() || null, idempotencyKey: crypto.randomUUID() };
    setAttempt(payload); setBusy(true); setMessage(null); onLock(true);
    try {
      const appointment = await operation<AppointmentView>(slug, 'appointments', 'POST', payload);
      setAttempt(null); setUncertain(false); onLock(false); onSaved(appointment);
    } catch (error) {
      const unknown = !(error instanceof OperationError) || error.status === 0 || error.status >= 500;
      if (unknown) { setUncertain(true); setMessage({ text: 'A resposta não chegou, mas o agendamento pode ter sido registrado. Use “Tentar confirmar novamente” para consultar o resultado da mesma solicitação, sem duplicar a reserva.', error: true }); }
      else {
        setAttempt(null); setUncertain(false); onLock(false);
        if (error.status === 409 || error.status === 404) { setAvailability(null); setStartsAt(''); }
        setMessage({ text: error.status === 409 ? 'Este horário ou os dados mudaram. Consulte os horários novamente antes de confirmar.' : error.message, error: true, signIn: error.status === 401 });
      }
    } finally { setBusy(false); }
  }

  return <div className="booking-create" aria-busy={busy}>
    <p className="booking-zone">Unidade: <strong>{location.name}</strong> · Fuso: <strong>{location.timezone}</strong></p>
    <BookingFeedback message={message} />
    <fieldset className="catalog-fields" disabled={locked}>
      <fieldset className="catalog-services"><legend>Serviços do agendamento</legend><p>Selecione até 10 serviços realizados pelo mesmo profissional.</p><div className="catalog-service-options">{services.map(service => <label key={service.id} className="catalog-checkbox"><input type="checkbox" checked={serviceIds.includes(service.id)} disabled={!serviceIds.includes(service.id) && serviceIds.length >= 10} onChange={event => { setServiceIds(previous => event.target.checked ? [...previous, service.id] : previous.filter(id => id !== service.id)); setProfessionalId(''); resetSlots(); }} />{service.name} · {service.durationMinutes} min · {formatPrice(service.priceCents)}</label>)}</div>{!services.length && <p>Nenhum serviço ativo disponível nesta unidade.</p>}</fieldset>
      <div className="catalog-form-grid"><label className="catalog-field">Profissional do agendamento<select value={professionalId} onChange={event => { setProfessionalId(event.target.value); resetSlots(); }}><option value="">Selecione um profissional</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select>{serviceIds.length > 0 && !professionals.length && <small>Nenhum profissional ativo realiza todos os serviços selecionados.</small>}</label><label className="catalog-field">Data do agendamento<input type="date" value={date} min={localDate(location.timezone)} onChange={event => { setDate(event.target.value); resetSlots(); }} /></label></div>
      <button type="button" className="button secondary" onClick={findSlots} disabled={!serviceIds.length || !professionalId || !date}>Consultar horários</button>
      {availability && <section className="booking-slots"><h3>Horários disponíveis</h3><p>{availability.durationMinutes} minutos · Total {formatPrice(availability.totalCents)} · {availability.timezone}</p>{availability.slots.length ? <div className="booking-slot-grid">{availability.slots.map(slot => <label key={slot.startsAt} className={`booking-slot ${startsAt === slot.startsAt ? 'booking-option-selected' : ''}`}><input type="radio" name="booking-slot" value={slot.startsAt} checked={startsAt === slot.startsAt} onChange={() => setStartsAt(slot.startsAt)} /><span>{appointmentTime(slot.startsAt, availability.timezone)}<small>até {appointmentTime(slot.endsAt, availability.timezone)}</small></span></label>)}</div> : <p className="notice">Não há horários livres nesta data. Escolha outra data ou revise a escala e os bloqueios da equipe.</p>}</section>}
    </fieldset>
    <CustomerPicker slug={slug} selected={customer} onSelect={selected => { setCustomer(selected); setMessage(null); }} canCreate={access.customersUpdate} disabled={locked} />
    <label className="catalog-field">Observações do agendamento<textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={3} disabled={locked} /></label>
    {startsAt && availability && customer && <p className="booking-selected"><strong>{customer.name} · {date.split('-').reverse().join('/')}</strong><span>{appointmentTime(startsAt, availability.timezone)} · {availability.durationMinutes} minutos · {formatPrice(availability.totalCents)}</span></p>}
    <button type="button" className="button booking-confirm" disabled={busy || (!uncertain && (!customer || !startsAt || !availability))} onClick={confirm}>{busy ? 'Confirmando…' : uncertain ? 'Tentar confirmar novamente' : 'Confirmar agendamento'}</button>
  </div>;
}
