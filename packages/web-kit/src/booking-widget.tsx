'use client';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import { bookingSelection } from './booking-selection';
import { maskPhone, parsePhone } from './mask';

interface Availability { timezone: string; totalCents: number; slots: { startsAt: string; endsAt: string }[] }
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
const styles = `.booking-widget{font-family:var(--theme-body-font,Arial);background:var(--theme-surface,#fff);color:var(--theme-text,#213b30);padding:clamp(20px,4vw,36px);border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:18px;max-width:900px;margin:auto}.booking-widget *{box-sizing:border-box}.booking-widget h3{font-size:26px;margin:0 0 12px}.booking-widget p{line-height:1.7}.booking-choice-summary{margin:0;align-self:center;font-size:14px}.booking-choice-summary strong{font-size:17px}.booking-fields{display:grid;grid-template-columns:1fr 1fr;gap:18px}.booking-widget label{display:grid;gap:9px;font-size:14px}.booking-widget input,.booking-widget select,.booking-widget button{font:inherit;min-height:46px;padding:12px;border-radius:8px;border:1px solid #bcc7bf;background:var(--theme-background,#f7f7f2);color:inherit;width:100%}.booking-widget button{cursor:pointer}.booking-widget button:disabled{opacity:.6;cursor:default}.booking-widget :focus-visible{outline:3px solid var(--theme-accent,#627d49);outline-offset:3px}.booking-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:10px;margin:20px 0}.booking-widget button[aria-pressed=true],.booking-widget .booking-submit{background:var(--theme-primary,#214b3b);color:var(--theme-background,#fff)}.booking-widget .booking-submit{margin-top:22px;font-weight:700}.booking-feedback{padding:16px;border:1px solid currentColor;border-radius:8px;margin:16px 0}.booking-summary{margin:20px 0;padding:16px;background:color-mix(in srgb,currentColor 5%,transparent);border-radius:10px}.booking-widget small{display:block;margin:10px 0;opacity:.8}@media(max-width:550px){.booking-fields{grid-template-columns:1fr}}`;
export function BookingWidget({ locationId, timezone = 'America/Sao_Paulo', services, professionals, preview = false }: { locationId: string; timezone?: string; services: readonly { id: string; name: string; priceCents?: number; priceLabel?: string; durationMinutes?: number }[]; professionals: readonly { id: string; name: string; specialty?: string; serviceIds?: readonly string[] }[]; preview?: boolean }) {
  const [service, setService] = useState(''); const [professionalChoice, setProfessional] = useState('');
  const eligibleProfessionals = professionals.filter(item => item.serviceIds?.includes(service)) ?? [];
  const professional = bookingSelection(eligibleProfessionals, professionalChoice);
  const [date, setDate] = useState(''); const [slot, setSlot] = useState(''); const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false); const [sending, setSending] = useState(false); const [error, setError] = useState(''); const [uncertain, setUncertain] = useState(false);
  const [customerMode, setCustomerMode] = useState<'guest' | 'returning'>('guest');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [receipt, setReceipt] = useState<{ id: string; startsAt: string; totalCents: number } | null>(null);
  const attempt = useRef<string | null>(null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  useEffect(() => {
    if (preview || !service || !professional || !date) return;
    const controller = new AbortController(); setLoading(true); setError(''); setAvailability(null);
    const query = new URLSearchParams({ locationId, professionalId: professional, serviceIds: service, date });
    fetch(`/api/booking/availability?${query}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Não foi possível consultar esta data. Escolha uma data futura.'); return response.json() as Promise<Availability>; }).then(data => { if (!controller.signal.aborted) setAvailability(data); }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preview, locationId, service, professional, date]);
  async function confirmBooking(event: FormEvent) {
    event.preventDefault(); if (sending || !slot) return;
    setSending(true); setError('');
    if (!attempt.current) attempt.current = JSON.stringify({ locationId, professionalId: professional, serviceIds: [service], startsAt: slot, idempotencyKey: crypto.randomUUID(), customer: { name: customer.name.trim(), phone: parsePhone(customer.phone), email: customer.email.trim() || null, notes: null } });
    try {
      const response = await fetch('/api/booking/appointments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: attempt.current, signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) throw new Error('A confirmação ainda não chegou. Repita a confirmação do mesmo pedido.');
        attempt.current = null; setUncertain(false);
        if (response.status === 409) { setSlot(''); setAvailability(null); throw new Error('Este horário foi ocupado. Altere a data para consultar novos horários.'); }
        throw new Error('Revise seus dados. O telefone deve ter DDD e número válido.');
      }
      const result = await response.json();
      if (typeof result.id !== 'string' || typeof result.startsAt !== 'string' || typeof result.totalCents !== 'number') throw new Error('Resposta incompleta. Repita a confirmação.');
      setReceipt(result); attempt.current = null; setUncertain(false);
    } catch (error) { setUncertain(attempt.current !== null); setError(error instanceof Error ? error.message : 'Falha de conexão. Repita a confirmação do mesmo pedido.'); }
    finally { setSending(false); }
  }

  if (preview) return <div className="booking-widget"><style>{styles}</style><h3>Reserve seu horário</h3><p>Escolha o serviço e encontre o melhor horário para você.</p>{services.slice(0, 3).map(item => <p key={item.id}>{item.name} · <strong>{item.priceLabel}</strong></p>)}<small>Prévia da agenda. Reservas disponíveis no site publicado.</small></div>;
  if (receipt) return <div className="booking-widget"><style>{styles}</style><h3>Agendamento confirmado</h3><p>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(new Date(receipt.startsAt))} · {money(receipt.totalCents)}</p><small>Protocolo: {receipt.id}</small><button onClick={() => { setReceipt(null); setSlot(''); setAvailability(null); setDate(''); setCustomer({ name: '', phone: '', email: '' }); }}>Fazer outro agendamento</button></div>;
  return <div className="booking-widget"><style>{styles}</style><h3>Reserve seu horário</h3><p>Escolha seu serviço e o dia da visita.</p>{error && <div className="booking-feedback" role="alert">{error}</div>}
    <><fieldset disabled={sending || uncertain} style={{ border: 0, padding: 0 }}><div className="booking-fields"><label>Serviço<select aria-label="Serviço" value={service} onChange={event => { setService(event.target.value); setProfessional(''); setSlot(''); setAvailability(null); }}><option value="">Selecione</option>{services.map(item => <option key={item.id} value={item.id}>{item.name} · {money(item.priceCents || 0)} · {item.durationMinutes} min</option>)}</select></label>{eligibleProfessionals.length > 1 ? <label>Profissional<select aria-label="Profissional" value={professional} onChange={event => { setProfessional(event.target.value); setSlot(''); setAvailability(null); setLoading(false); }} disabled={!service}><option value="">Selecione</option>{eligibleProfessionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : eligibleProfessionals[0] ? <p className="booking-choice-summary">Seu atendimento com<br /><strong>{eligibleProfessionals[0].name}</strong></p> : service ? <p role="status">Nenhum profissional disponível para este serviço. Escolha outro serviço ou entre em contato com a barbearia.</p> : null}<label>Data<input type="date" value={date} min={today} onChange={event => { setDate(event.target.value); setSlot(''); setAvailability(null); setLoading(false); }} disabled={!professional} /></label></div><small>Horários no fuso {timezone}.</small>
    {loading && <p role="status">Consultando horários…</p>}{availability && <><div className="booking-summary">Valor: <strong>{money(availability.totalCents)}</strong></div><div className="booking-slots">{availability.slots.map(item => <button type="button" key={item.startsAt} aria-pressed={slot === item.startsAt} onClick={() => setSlot(item.startsAt)}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: availability.timezone }).format(new Date(item.startsAt))}</button>)}</div>{!availability.slots.length && <p>Nenhum horário disponível nesta data.</p>}</>}
    </fieldset>{slot && <form onSubmit={confirmBooking}><fieldset disabled={sending || uncertain} style={{ border: 0, padding: 0 }}>
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', padding: '4px', background: 'color-mix(in srgb, currentColor 5%, transparent)', borderRadius: '10px' }}>
            <button type="button" onClick={() => setCustomerMode('guest')} aria-pressed={customerMode === 'guest'} style={{ flex: 1, border: 0, padding: '10px', borderRadius: '8px', background: customerMode === 'guest' ? 'var(--theme-surface, #fff)' : 'transparent', color: 'inherit', fontWeight: customerMode === 'guest' ? 600 : 400, boxShadow: customerMode === 'guest' ? '0 2px 8px -2px color-mix(in srgb, currentColor 20%, transparent)' : 'none' }}>Convidado</button>
            <button type="button" onClick={() => setCustomerMode('returning')} aria-pressed={customerMode === 'returning'} style={{ flex: 1, border: 0, padding: '10px', borderRadius: '8px', background: customerMode === 'returning' ? 'var(--theme-surface, #fff)' : 'transparent', color: 'inherit', fontWeight: customerMode === 'returning' ? 600 : 400, boxShadow: customerMode === 'returning' ? '0 2px 8px -2px color-mix(in srgb, currentColor 20%, transparent)' : 'none' }}>Já sou cliente</button>
          </div>

          <div className="booking-fields">
            <label>Nome completo {customerMode === 'returning' && <small style={{display: 'inline', opacity: 0.7, margin: 0}}>(para confirmação)</small>}
              <input required maxLength={120} value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} />
            </label>
            <label>Celular (WhatsApp)
              <input type="tel" required minLength={14} maxLength={15} placeholder="(11) 99999-9999" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: maskPhone(event.target.value) })} />
            </label>
            {customerMode === 'guest' && (
              <label>E-mail <small style={{display: 'inline', opacity: 0.7, margin: 0}}>(opcional)</small>
                <input type="email" maxLength={254} value={customer.email} onChange={event => setCustomer({ ...customer, email: event.target.value })} />
              </label>
            )}
          </div>
        </>
    </fieldset><button className="booking-submit" disabled={sending}>{sending ? 'Aguarde…' : uncertain ? 'Repetir confirmação' : 'Confirmar agendamento'}</button>
    </form>}</>
  </div>;
}
