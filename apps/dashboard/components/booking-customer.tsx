'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CustomerFields, CustomerView } from '@platform/types';
import { operation, OperationError } from '../lib/booking-client';
import { BookingFeedback } from './booking-common';
import type { BookingMessage } from './booking-common';
import { maskPhone, parsePhone } from '@platform/web-kit';

export function CustomerPicker({ slug, selected, onSelect, canCreate, disabled }: { slug: string; selected: CustomerView | null; onSelect: (customer: CustomerView) => void; canCreate: boolean; disabled: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerView[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<BookingMessage | null>(null);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true); setMessage(null);
    try { const result = await operation<{ items: CustomerView[] }>(slug, `customers?${new URLSearchParams({ q: query.trim() })}`); setResults(result.items); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Não foi possível buscar clientes.', error: true, signIn: error instanceof OperationError && error.status === 401 }); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const form = new FormData(event.currentTarget);
    const parsedPhone = parsePhone(String(form.get('phone') || '').trim());
    const data: CustomerFields = { name: String(form.get('name') || '').trim(), phone: parsedPhone, email: String(form.get('email') || '').trim() || null, notes: String(form.get('notes') || '').trim() || null };
    if (!data.name || data.name.length > 120 || !/^\+[1-9]\d{7,14}$/.test(data.phone)) { setMessage({ text: 'Informe o nome e o telefone completo (com DDD).', error: true }); return; }
    setBusy(true); setMessage(null);
    try { const customer = await operation<CustomerView>(slug, 'customers', 'POST', data); onSelect(customer); setCreating(false); setResults(null); setMessage({ text: 'Cliente cadastrado e selecionado.' }); }
    catch (error) { setMessage({ text: error instanceof OperationError && error.status === 409 ? 'Já existe um cliente com este telefone. Use a busca para selecionar o cadastro existente.' : 'Não foi possível confirmar o cadastro. Busque pelo telefone antes de tentar novamente.', error: true, signIn: error instanceof OperationError && error.status === 401 }); }
    finally { setBusy(false); }
  }
  return <section className="booking-customer" aria-label="Selecionar cliente">
    <h3>Cliente</h3><p>Busque um cadastro existente ou cadastre o cliente antes de confirmar o atendimento.</p>
    {selected && <p className="booking-selected"><strong>Cliente selecionado: {selected.name}</strong><span>{selected.phone}</span></p>}
    <BookingFeedback message={message} />
    <form onSubmit={search} className="booking-search"><label className="catalog-field">Buscar cliente<input value={query} onChange={event => setQuery(event.target.value)} maxLength={80} placeholder="Nome ou telefone" disabled={disabled || busy} /></label><button className="button secondary" disabled={disabled || busy} type="submit">{busy ? 'Aguarde…' : 'Buscar clientes'}</button>{canCreate && <button className="button secondary" type="button" disabled={disabled || busy} onClick={() => { setCreating(!creating); setMessage(null); }}>{creating ? 'Cancelar cadastro de cliente' : 'Novo cliente'}</button>}</form>
    {results && <div className="booking-customer-results">{results.length ? results.map(customer => <button type="button" key={customer.id} className={`booking-customer-option ${selected?.id === customer.id ? 'booking-option-selected' : ''}`} aria-pressed={selected?.id === customer.id} disabled={disabled || busy} onClick={() => { onSelect(customer); setMessage(null); }}><strong>{customer.name}</strong><span>{customer.phone}</span><span>{selected?.id === customer.id ? 'Selecionado' : 'Selecionar cliente'}</span></button>) : <p>Nenhum cliente encontrado. Revise a busca{canCreate ? ' ou use “Novo cliente”' : ''}.</p>}</div>}
    {creating && <form className="catalog-form booking-customer-form" onSubmit={create}><fieldset className="catalog-fields" disabled={disabled || busy}><h4>Novo cliente</h4><div className="catalog-form-grid"><label className="catalog-field">Nome do cliente<input name="name" required maxLength={120} autoComplete="name" /></label><label className="catalog-field">Telefone do cliente<input name="phone" type="tel" required minLength={14} maxLength={15} placeholder="(11) 99999-9999" autoComplete="tel" onInput={(e) => { e.currentTarget.value = maskPhone(e.currentTarget.value); }} /><small>Informe o DDD e o número.</small></label><label className="catalog-field">E-mail do cliente<input name="email" type="email" maxLength={254} autoComplete="email" /></label></div><label className="catalog-field">Observações do cliente<textarea name="notes" maxLength={2000} rows={2} /></label><button className="button" type="submit">Salvar cliente</button></fieldset></form>}
  </section>;
}


