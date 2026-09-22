'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { bookingSelection, professionalsForServices } from './booking-selection';
import { maskPhone, parsePhone } from './mask';

interface Service { id: string; name: string; priceCents?: number; priceLabel?: string; durationMinutes?: number }
interface Professional { id: string; name: string; specialty?: string; serviceIds?: readonly string[] }
interface Availability { timezone: string; durationMinutes: number; totalCents: number; slots: { startsAt: string; endsAt: string }[] }

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
const styles = `.booking-widget{font-family:var(--theme-body-font,Arial);background:var(--theme-surface,#fff);color:var(--theme-text,#213b30);padding:clamp(20px,4vw,36px);border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:18px;max-width:900px;margin:auto}.booking-widget *{box-sizing:border-box}.booking-widget h3{font-size:26px;margin:0 0 12px}.booking-widget p{line-height:1.7}.booking-choice-summary{margin:0;align-self:center;font-size:14px}.booking-choice-summary strong{font-size:17px}.booking-fields{display:grid;grid-template-columns:1fr 1fr;gap:18px}.booking-widget label{display:grid;gap:9px;font-size:14px}.booking-widget input,.booking-widget select,.booking-widget button{font:inherit;min-height:46px;padding:12px;border-radius:8px;border:1px solid #bcc7bf;background:var(--theme-background,#f7f7f2);color:inherit;width:100%}.booking-widget button{cursor:pointer}.booking-widget button:disabled{opacity:.6;cursor:default}.booking-widget :focus-visible{outline:3px solid var(--theme-accent,#627d49);outline-offset:3px}.booking-service-fieldset{border:0;padding:0;margin:22px 0}.booking-service-fieldset legend{font-size:15px;font-weight:700;margin-bottom:6px}.booking-service-help{margin:0 0 14px;font-size:13px;opacity:.78}.booking-services{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.booking-service-option{position:relative;display:grid!important;grid-template-columns:auto 1fr;align-items:start;gap:12px!important;padding:14px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;background:color-mix(in srgb,currentColor 3%,transparent);cursor:pointer}.booking-service-option:hover{border-color:color-mix(in srgb,currentColor 42%,transparent)}.booking-service-option[data-selected=true]{border-color:var(--theme-primary,#214b3b);background:color-mix(in srgb,var(--theme-primary,#214b3b) 10%,transparent)}.booking-service-option input{width:20px;height:20px;min-height:20px;padding:0;margin:2px 0 0;border:1.5px solid currentColor;border-radius:5px;-webkit-appearance:none;appearance:none;background:transparent}.booking-service-option input:checked{border-color:var(--theme-primary,#214b3b);background-color:var(--theme-primary,#214b3b);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='m5 10 3 3 7-7' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}.booking-service-option strong,.booking-service-option small{display:block;margin:0}.booking-service-option small{margin-top:5px}.booking-bundle{display:flex;justify-content:space-between;gap:20px;align-items:center;margin:18px 0;padding:17px 18px;background:color-mix(in srgb,currentColor 6%,transparent);border-radius:12px}.booking-bundle span{display:block;font-size:13px;opacity:.78}.booking-bundle strong{font-size:18px}.booking-date-control{position:relative;display:block}.booking-date-control input{display:block;min-width:0;height:48px;padding-right:46px;font-size:16px;line-height:1.2;-webkit-appearance:none;appearance:none}.booking-date-control input::-webkit-date-and-time-value{text-align:left}.booking-date-control input::-webkit-calendar-picker-indicator{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.booking-date-icon{position:absolute;right:14px;top:50%;width:20px;height:20px;transform:translateY(-50%);pointer-events:none}.booking-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:10px;margin:20px 0}.booking-widget button[aria-pressed=true],.booking-widget .booking-submit{background:var(--theme-primary,#214b3b);color:var(--theme-background,#fff)}.booking-widget .booking-submit{margin-top:22px;font-weight:700}.booking-feedback{padding:16px;border:1px solid currentColor;border-radius:8px;margin:16px 0}.booking-summary{margin:20px 0;padding:16px;background:color-mix(in srgb,currentColor 5%,transparent);border-radius:10px}.booking-confirmed-services{margin:14px 0;padding-left:20px}.booking-widget small{display:block;margin:10px 0;opacity:.8}@supports(padding:max(0px)){.booking-widget{padding-left:max(20px,env(safe-area-inset-left));padding-right:max(20px,env(safe-area-inset-right))}}@media(max-width:550px){.booking-widget input,.booking-widget select,.booking-widget button{font-size:16px}.booking-fields,.booking-services{grid-template-columns:1fr}.booking-bundle{align-items:flex-start;flex-direction:column;gap:8px}}`;

export function BookingWidget({ locationId, timezone = 'America/Sao_Paulo', services, professionals, preview = false }: { locationId: string; timezone?: string; services: readonly Service[]; professionals: readonly Professional[]; preview?: boolean }) {
  const [ready, setReady] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [professionalChoice, setProfessional] = useState('');
  const selectedServices = services.filter(service => serviceIds.includes(service.id));
  const eligibleProfessionals = professionalsForServices(professionals, serviceIds);
  const professional = bookingSelection(eligibleProfessionals, professionalChoice);
  const estimatedDuration = selectedServices.reduce((total, service) => total + (service.durationMinutes ?? 0), 0);
  const estimatedTotal = selectedServices.reduce((total, service) => total + (service.priceCents ?? 0), 0);
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [customerMode, setCustomerMode] = useState<'guest' | 'returning'>('guest');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [receipt, setReceipt] = useState<{ id: string; startsAt: string; totalCents: number } | null>(null);
  const attempt = useRef<string | null>(null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  useEffect(() => setReady(true), []);

  function resetAvailability() {
    setSlot('');
    setAvailability(null);
    setLoading(false);
    setError('');
    setUncertain(false);
    attempt.current = null;
  }

  function toggleService(serviceId: string, selected: boolean) {
    setServiceIds(current => selected ? [...current, serviceId] : current.filter(id => id !== serviceId));
    setProfessional('');
    resetAvailability();
  }

  useEffect(() => {
    if (preview || !serviceIds.length || !professional || !date) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setAvailability(null);
    const query = new URLSearchParams({ locationId, professionalId: professional, serviceIds: [...serviceIds].sort().join(','), date });
    fetch(`/api/booking/availability?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Não foi possível consultar esta data. Escolha uma data futura.');
        return response.json() as Promise<Availability>;
      })
      .then(data => { if (!controller.signal.aborted) setAvailability(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Não foi possível consultar os horários.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preview, locationId, serviceIds, professional, date]);

  async function confirmBooking(event: FormEvent) {
    event.preventDefault();
    if (sending || !slot || !professional || !serviceIds.length) return;
    setSending(true);
    setError('');
    if (!attempt.current) attempt.current = JSON.stringify({ locationId, professionalId: professional, serviceIds: [...serviceIds].sort(), startsAt: slot, idempotencyKey: crypto.randomUUID(), customer: { name: customer.name.trim(), phone: parsePhone(customer.phone), email: customer.email.trim() || null, notes: null } });
    try {
      const response = await fetch('/api/booking/appointments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: attempt.current, signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) throw new Error('A confirmação ainda não chegou. Repita a confirmação do mesmo pedido.');
        attempt.current = null;
        setUncertain(false);
        if (response.status === 409) { setSlot(''); setAvailability(null); throw new Error('Este horário foi ocupado. Altere a data para consultar novos horários.'); }
        throw new Error('Revise seus dados. O telefone deve ter DDD e número válido.');
      }
      const result = await response.json();
      if (typeof result.id !== 'string' || typeof result.startsAt !== 'string' || typeof result.totalCents !== 'number') throw new Error('Resposta incompleta. Repita a confirmação.');
      setReceipt(result);
      attempt.current = null;
      setUncertain(false);
    } catch (error) {
      setUncertain(attempt.current !== null);
      setError(error instanceof Error ? error.message : 'Falha de conexão. Repita a confirmação do mesmo pedido.');
    } finally { setSending(false); }
  }

  if (preview) return <div className="booking-widget"><style>{styles}</style><h3>Reserve seu horário</h3><p>Combine os serviços que deseja e encontre um horário com a duração correta.</p>{services.slice(0, 3).map(item => <p key={item.id}>{item.name} · <strong>{item.priceLabel}</strong></p>)}<small>Prévia da agenda. Reservas disponíveis no site publicado.</small></div>;
  if (receipt) return <div className="booking-widget"><style>{styles}</style><h3>Agendamento confirmado</h3><p>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(new Date(receipt.startsAt))}</p><ul className="booking-confirmed-services">{selectedServices.map(service => <li key={service.id}>{service.name}</li>)}</ul><div className="booking-bundle"><div><span>Tempo estimado</span><strong>{availability?.durationMinutes ?? estimatedDuration} minutos</strong></div><div><span>Valor total</span><strong>{money(receipt.totalCents)}</strong></div></div><small>Protocolo: {receipt.id}</small><button onClick={() => { setReceipt(null); setServiceIds([]); setProfessional(''); setSlot(''); setAvailability(null); setDate(''); setCustomer({ name: '', phone: '', email: '' }); }}>Fazer outro agendamento</button></div>;

  return <div className="booking-widget"><style>{styles}</style><h3>Reserve seu horário</h3><p>Selecione um ou mais serviços para calcular o tempo e o valor da visita.</p>{error && <div className="booking-feedback" role="alert">{error}</div>}
    <fieldset disabled={!ready || sending || uncertain} style={{ border: 0, padding: 0 }}>
      <fieldset className="booking-service-fieldset"><legend>Serviços</legend><p className="booking-service-help">Escolha até 10 serviços realizados pela mesma pessoa.</p><div className="booking-services">{services.map(service => {
        const selected = serviceIds.includes(service.id);
        return <label className="booking-service-option" data-selected={selected} key={service.id}><input type="checkbox" checked={selected} disabled={!selected && serviceIds.length >= 10} onChange={event => toggleService(service.id, event.target.checked)} /><span><strong>{service.name}</strong><small>{service.durationMinutes} min · {money(service.priceCents ?? 0)}</small></span></label>;
      })}</div></fieldset>
      {!!serviceIds.length && <div className="booking-bundle" role="status"><div><span>{serviceIds.length} {serviceIds.length === 1 ? 'serviço selecionado' : 'serviços selecionados'}</span><strong>{estimatedDuration} minutos</strong></div><div><span>Valor estimado</span><strong>{money(estimatedTotal)}</strong></div></div>}
      <div className="booking-fields">{eligibleProfessionals.length > 1 ? <label>Profissional<select aria-label="Profissional" value={professional} onChange={event => { setProfessional(event.target.value); resetAvailability(); }}><option value="">Selecione</option>{eligibleProfessionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : eligibleProfessionals[0] ? <p className="booking-choice-summary">Seu atendimento com<br /><strong>{eligibleProfessionals[0].name}</strong></p> : serviceIds.length ? <p role="status">Nenhum profissional realiza todos os serviços selecionados. Remova um serviço ou entre em contato com a barbearia.</p> : null}<label>Data<span className="booking-date-control"><input aria-label="Data" type="date" value={date} min={today} onChange={event => { setDate(event.target.value); resetAvailability(); }} disabled={!professional} /><svg className="booking-date-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 5h14v16H5zM8 3v4m8-4v4M5 10h14" /></svg></span></label></div><small>Horários no fuso {timezone}.</small>
      {loading && <p role="status">Consultando horários…</p>}{availability && <><div className="booking-summary">Tempo: <strong>{availability.durationMinutes} minutos</strong> · Valor total: <strong>{money(availability.totalCents)}</strong></div><div className="booking-slots">{availability.slots.map(item => <button type="button" key={item.startsAt} aria-pressed={slot === item.startsAt} onClick={() => setSlot(item.startsAt)}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: availability.timezone }).format(new Date(item.startsAt))}</button>)}</div>{!availability.slots.length && <p>Nenhum horário disponível nesta data.</p>}</>}
    </fieldset>
    {slot && <form onSubmit={confirmBooking} noValidate><fieldset disabled={sending || uncertain} style={{ border: 0, padding: 0 }}><div style={{ display: 'flex', gap: '8px', marginBottom: '18px', padding: '4px', background: 'color-mix(in srgb, currentColor 5%, transparent)', borderRadius: '10px' }}><button type="button" onClick={() => setCustomerMode('guest')} aria-pressed={customerMode === 'guest'} style={{ flex: 1, border: 0, padding: '10px', borderRadius: '8px', background: customerMode === 'guest' ? 'var(--theme-surface, #fff)' : 'transparent', color: 'inherit', fontWeight: customerMode === 'guest' ? 600 : 400, boxShadow: customerMode === 'guest' ? '0 2px 8px -2px color-mix(in srgb, currentColor 20%, transparent)' : 'none' }}>Convidado</button><button type="button" onClick={() => setCustomerMode('returning')} aria-pressed={customerMode === 'returning'} style={{ flex: 1, border: 0, padding: '10px', borderRadius: '8px', background: customerMode === 'returning' ? 'var(--theme-surface, #fff)' : 'transparent', color: 'inherit', fontWeight: customerMode === 'returning' ? 600 : 400, boxShadow: customerMode === 'returning' ? '0 2px 8px -2px color-mix(in srgb, currentColor 20%, transparent)' : 'none' }}>Já sou cliente</button></div><div className="booking-fields"><label>Nome completo {customerMode === 'returning' && <small style={{ display: 'inline', opacity: 0.7, margin: 0 }}>(para confirmação)</small>}<input required maxLength={120} value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} /></label><label>Celular (WhatsApp)<input type="tel" required minLength={14} maxLength={15} placeholder="(11) 99999-9999" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: maskPhone(event.target.value) })} /></label>{customerMode === 'guest' && <label>E-mail <small style={{ display: 'inline', opacity: 0.7, margin: 0 }}>(opcional)</small><input type="email" maxLength={254} value={customer.email} onChange={event => setCustomer({ ...customer, email: event.target.value })} /></label>}</div></fieldset><button className="booking-submit" disabled={sending}>{sending ? 'Aguarde…' : uncertain ? 'Repetir confirmação' : 'Confirmar agendamento'}</button></form>}
  </div>;
}
