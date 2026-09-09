'use client';
import { useState } from 'react';
import type { AppointmentView, AvailabilityView, BookingLocation } from '@platform/types';
import { appointmentTime, localDate, operation, OperationError } from '../lib/booking-client';
import { formatPrice } from '../lib/catalog-format';
import { BookingFeedback } from './booking-common';
import type { BookingMessage } from './booking-common';

export function RescheduleBooking({ slug, appointment, location, onSaved, onStale, onLock, disabled }: { slug: string; appointment: AppointmentView; location: BookingLocation; onSaved: (appointment: AppointmentView) => void; onStale: () => void; onLock: (busy: boolean) => void; disabled: boolean }) {
  const [date, setDate] = useState(localDate(location.timezone, new Date(appointment.startsAt)));
  const [availability, setAvailability] = useState<AvailabilityView | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<BookingMessage | null>(null);
  async function findSlots() {
    if (busy || disabled || !date) return;
    setBusy(true); onLock(true); setMessage(null); setAvailability(null); setStartsAt('');
    try { setAvailability(await operation<AvailabilityView>(slug, `availability?${new URLSearchParams({ locationId: appointment.locationId, professionalId: appointment.professionalId, appointmentId: appointment.id, serviceIds: appointment.services.map(service => service.serviceId).sort().join(','), date })}`)); }
    catch (error) { if (error instanceof OperationError && error.status === 409) onStale(); setMessage({ text: error instanceof Error ? error.message : 'Não foi possível consultar os horários.', error: true }); }
    finally { setBusy(false); onLock(false); }
  }
  async function save() {
    if (busy || disabled || !startsAt || !availability) return;
    setBusy(true); onLock(true); setMessage(null);
    try { onSaved(await operation<AppointmentView>(slug, `appointments/${encodeURIComponent(appointment.id)}/reschedule`, 'POST', { startsAt, expectedVersion: appointment.version })); }
    catch (error) {
      if (!(error instanceof OperationError) || error.status === 0 || error.status >= 500 || error.status === 409 || error.status === 404) onStale();
      setAvailability(null); setStartsAt('');
      setMessage({ text: error instanceof Error ? error.message : 'Não foi possível confirmar a alteração. Recarregue a agenda.', error: true, signIn: error instanceof OperationError && error.status === 401 });
    } finally { setBusy(false); onLock(false); }
  }
  return <div aria-busy={busy}><p><strong>{appointment.customer.name}</strong> · {appointment.professionalName}</p><p>Horário atual: {appointmentTime(appointment.startsAt, location.timezone, true)}. Os serviços, a duração e os valores contratados serão preservados.</p><BookingFeedback message={message} />
    <fieldset className="catalog-fields" disabled={busy || disabled}><label className="catalog-field">Nova data<input type="date" value={date} min={localDate(location.timezone)} onChange={event => { setDate(event.target.value); setAvailability(null); setStartsAt(''); }} /></label><button type="button" className="button secondary" onClick={findSlots} disabled={!date}>Consultar novos horários</button>
      {availability && <section className="booking-slots"><h3>Novos horários disponíveis</h3><p>{availability.durationMinutes} minutos · {formatPrice(availability.totalCents)} · {availability.timezone}</p>{availability.slots.length ? <div className="booking-slot-grid">{availability.slots.map(slot => <label key={slot.startsAt} className={`booking-slot ${startsAt === slot.startsAt ? 'booking-option-selected' : ''}`}><input type="radio" name="reschedule-slot" checked={startsAt === slot.startsAt} onChange={() => setStartsAt(slot.startsAt)} /><span>{appointmentTime(slot.startsAt, availability.timezone)}<small>até {appointmentTime(slot.endsAt, availability.timezone)}</small></span></label>)}</div> : <p className="notice">Não há horários livres nesta data.</p>}</section>}
      <button type="button" className="button" onClick={save} disabled={!startsAt || !availability}>Confirmar reagendamento</button>
    </fieldset>
  </div>;
}
