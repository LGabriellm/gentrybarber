'use client';

import { useState, useEffect } from 'react';

export function BookingWidget({
  locationId,
  services,
  professionals,
}: {
  locationId: string;
  services: readonly { id: string; name: string; priceLabel?: string; durationMinutes?: number }[];
  professionals: readonly { id: string; name: string; specialty?: string }[];
}) {
  const [step, setStep] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<{ date: string; slots: { startsAt: string; endsAt: string }[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', notes: '' });

  useEffect(() => {
    if (step === 3 && selectedServiceId && selectedProfessionalId) {
      loadAvailability(selectedDate || new Date().toISOString().substring(0, 10));
    }
  }, [step, selectedServiceId, selectedProfessionalId, selectedDate]);

  async function loadAvailability(date: string) {
    setLoading(true);
    setError('');
    try {
      const hostname = window.location.hostname;
      const res = await fetch(`/v1/public/booking/availability?hostname=${encodeURIComponent(hostname)}&locationId=${locationId}&professionalId=${selectedProfessionalId}&serviceIds=${selectedServiceId}&date=${date}`);
      if (!res.ok) throw new Error('Não foi possível carregar os horários disponíveis.');
      const data = await res.json();
      setAvailableDates([{ date, slots: data.slots }]);
      if (!selectedDate) setSelectedDate(date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const hostname = window.location.hostname;
      const res = await fetch(`/v1/public/booking/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname,
          locationId,
          professionalId: selectedProfessionalId,
          serviceIds: [selectedServiceId],
          startsAt: selectedTime,
          idempotencyKey: crypto.randomUUID(),
          customer: {
            name: customer.name,
            phone: customer.phone,
            email: customer.email || null,
            notes: customer.notes || null,
          }
        })
      });
      if (!res.ok) throw new Error('Falha ao confirmar o agendamento. Tente novamente.');
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao agendar');
    } finally {
      setLoading(false);
    }
  }

  if (step === 1) {
    return (
      <div className="booking-widget p-6 bg-white rounded-lg shadow-sm border border-neutral-200">
        <h3 className="text-xl font-bold mb-4">Escolha um Serviço</h3>
        <div className="grid gap-3">
          {services.map(s => (
            <button key={s.id} onClick={() => { setSelectedServiceId(s.id); setStep(2); }} className="flex justify-between items-center p-4 border rounded hover:border-primary-500 hover:bg-neutral-50 transition-colors text-left">
              <div>
                <strong className="block">{s.name}</strong>
              </div>
              <div className="text-right">
                <span className="block font-medium">{s.priceLabel}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="booking-widget p-6 bg-white rounded-lg shadow-sm border border-neutral-200">
        <div className="flex items-center mb-4">
          <button onClick={() => setStep(1)} className="mr-3 text-neutral-400 hover:text-black">← Voltar</button>
          <h3 className="text-xl font-bold m-0">Escolha o Profissional</h3>
        </div>
        <div className="grid gap-3">
          {professionals.map(p => (
            <button key={p.id} onClick={() => { setSelectedProfessionalId(p.id); setStep(3); }} className="p-4 border rounded hover:border-primary-500 hover:bg-neutral-50 transition-colors text-left">
              <strong className="block">{p.name}</strong>
              {p.specialty && <span className="text-sm text-neutral-500">{p.specialty}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="booking-widget p-6 bg-white rounded-lg shadow-sm border border-neutral-200">
        <div className="flex items-center mb-4">
          <button onClick={() => setStep(2)} className="mr-3 text-neutral-400 hover:text-black">← Voltar</button>
          <h3 className="text-xl font-bold m-0">Data e Horário</h3>
        </div>
        <div className="mb-4">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full p-3 border rounded" min={new Date().toISOString().split('T')[0]} />
        </div>
        {loading ? <p className="text-center py-4 text-neutral-500">Buscando horários...</p> : error ? <p className="text-red-500">{error}</p> : (
          <div className="grid grid-cols-3 gap-2">
            {availableDates.find(d => d.date === selectedDate)?.slots.length ? (
              availableDates.find(d => d.date === selectedDate)?.slots.map((slot, i) => {
                const time = new Date(slot.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
                return (
                  <button key={i} onClick={() => { setSelectedTime(slot.startsAt); setStep(4); }} className="p-3 text-center border rounded hover:border-primary-500 hover:bg-neutral-50">
                    {time}
                  </button>
                );
              })
            ) : (
              <p className="col-span-3 text-center py-4 text-neutral-500">Nenhum horário disponível.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="booking-widget p-6 bg-white rounded-lg shadow-sm border border-neutral-200">
        <div className="flex items-center mb-4">
          <button onClick={() => setStep(3)} className="mr-3 text-neutral-400 hover:text-black">← Voltar</button>
          <h3 className="text-xl font-bold m-0">Seus Dados</h3>
        </div>
        <form onSubmit={submitBooking}>
          <div className="space-y-3 mb-6">
            <label className="block text-sm">Nome completo <input type="text" required value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} className="w-full p-3 mt-1 border rounded" /></label>
            <label className="block text-sm">WhatsApp <input type="tel" required placeholder="+5511999999999" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} className="w-full p-3 mt-1 border rounded" /></label>
            <label className="block text-sm">E-mail <input type="email" value={customer.email} onChange={e => setCustomer({...customer, email: e.target.value})} className="w-full p-3 mt-1 border rounded" /></label>
          </div>
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <button type="submit" disabled={loading} className="w-full p-4 bg-black text-white rounded font-bold hover:bg-neutral-800 disabled:opacity-50">
            {loading ? 'Confirmando...' : 'Confirmar'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="booking-widget p-8 bg-white rounded-lg shadow-sm border border-neutral-200 text-center">
        <h3 className="text-2xl font-bold mb-2">Agendamento Confirmado!</h3>
        <p className="text-neutral-600 mb-6">Você receberá uma notificação no WhatsApp em breve.</p>
        <button onClick={() => { setStep(1); setSelectedServiceId(''); setSelectedProfessionalId(''); setSelectedDate(''); setSelectedTime(''); setCustomer({name:'', phone:'', email:'', notes:''}); }} className="px-6 py-3 border border-neutral-300 rounded hover:bg-neutral-50">Novo agendamento</button>
      </div>
    );
  }

  return null;
}
