'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CustomerView } from '@platform/types';
import './catalog.css'; // Reusing catalog styles for the list

type CustomerInput = { name: string; phone: string; email?: string | null; notes?: string | null; expectedVersion?: number };
type Feedback = { text: string; error: boolean; conflict?: boolean; signIn?: boolean } | null;

const failureMessages: Record<number, string> = {
  400: 'Revise os campos e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Seu acesso não permite realizar esta ação. Consulte o responsável pela barbearia.',
  404: 'O registro não está mais disponível nesta barbearia. Recarregue os dados.',
  409: 'Este registro foi alterado por outra pessoa. Recarregue os dados antes de editar novamente; seu formulário será descartado.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um momento antes de tentar novamente.',
};

export function CustomerManager({ slug, initialData, canUpdate }: { slug: string; initialData: { items: CustomerView[]; page?: number; hasMore?: boolean }; canUpdate: boolean }) {
  const [data, setData] = useState(initialData.items);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(initialData.page ?? 1);
  const [hasMore, setHasMore] = useState(initialData.hasMore ?? false);
  const [editing, setEditing] = useState<CustomerView | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const apiPath = `/api/operations/${encodeURIComponent(slug)}/customers`;
  const items = data;

  function announce(value: Feedback) {
    setFeedback(value);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  function openEditor(entry: CustomerView | 'new') {
    setEditing(entry);
    setFeedback(null);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      editorRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    });
  }

  async function save(input: CustomerInput, entry?: CustomerView) {
    if (busy || feedback?.conflict) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`${apiPath}${entry ? '/' + encodeURIComponent(entry.id) : ''}`, {
        method: entry ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input), credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        announce({ text: failureMessages[response.status] || 'Não foi possível salvar. Tente novamente.', error: true, conflict: response.status === 409, signIn: response.status === 401 });
        return;
      }
      const saved = await response.json() as CustomerView;
      setData(previous => {
        const next = [...previous.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        return next;
      });
      setEditing(null);
      announce({ text: `Cliente ${entry ? 'atualizado' : 'cadastrado'} com sucesso.`, error: false });
    } catch {
      announce({ text: 'Não foi possível confirmar o salvamento. Recarregue os dados antes de tentar novamente.', error: true, conflict: true });
    } finally {
      setBusy(false);
    }
  }

  async function reload(nextPage = page, nextQuery = query) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiPath}?${new URLSearchParams({ q: nextQuery.trim(), page: String(nextPage) })}`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        announce({ text: failureMessages[response.status] || 'Não foi possível recarregar. Tente novamente.', error: true, conflict: feedback?.conflict, signIn: response.status === 401 });
        return;
      }
      const fresh = await response.json() as { items: CustomerView[]; page: number; hasMore: boolean };
      setData(fresh.items);
      setPage(fresh.page); setHasMore(fresh.hasMore); setQuery(nextQuery.trim());
      setEditing(null);
      announce({ text: 'Dados atualizados. Você pode abrir o registro para editar novamente.', error: false });
    } catch {
      announce({ text: 'Não foi possível recarregar os dados. Verifique sua conexão e tente novamente.', error: true, conflict: feedback?.conflict });
    } finally {
      setBusy(false);
    }
  }

  return <div className="catalog-manager" aria-busy={busy}>
    <div className="catalog-toolbar">
      <form onSubmit={event => { event.preventDefault(); void reload(1, search); }} className="catalog-actions"><label className="catalog-filter" style={{ minWidth: 260 }}>Buscar cliente<input type="search" value={search} maxLength={80} onChange={e => setSearch(e.target.value)} placeholder="Nome, telefone ou e-mail" disabled={busy} /></label><button className="button secondary" disabled={busy}>Buscar</button></form>
      <div className="catalog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => void reload()}>{busy ? 'Aguarde…' : 'Recarregar'}</button>
        {canUpdate && <button type="button" className="button" disabled={busy || !!feedback?.conflict} onClick={() => openEditor('new')}>Novo Cliente</button>}
      </div>
    </div>
    
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`catalog-feedback ${feedback.error ? 'catalog-feedback-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
      <p>{feedback.text}</p>{feedback.signIn && <a href="/login">Entrar novamente</a>}
      {feedback.conflict && <button className="button secondary" type="button" disabled={busy} onClick={() => void reload()}>Recarregar e descartar formulário</button>}
    </div>}
    
    {editing && <section ref={editorRef} className="panel catalog-editor" aria-label={editing === 'new' ? `Novo Cliente` : `Editar Cliente`}>
      <div className="section-heading"><h2>{editing === 'new' ? `Novo Cliente` : `Editar Cliente`}</h2><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></div>
      <CustomerEditor key={editing === 'new' ? 'new-customer' : `${editing.id}-${editing.version}`} entry={editing === 'new' ? undefined : editing} disabled={busy || !!feedback?.conflict} onInvalid={text => announce({ text, error: true })} onSave={save} />
    </section>}
    
    <section className="catalog-list" aria-label="Lista de clientes">
      <div className="catalog-list-heading"><h2>Carteira de Clientes</h2><span>{items.length} {items.length === 1 ? 'cliente nesta página' : 'clientes nesta página'}</span></div>
      {items.length === 0 ? <div className="panel catalog-empty"><h3>Nenhum cliente encontrado.</h3><p>{search ? 'Tente buscar com outros termos.' : canUpdate ? 'Use “Novo Cliente” para cadastrar manualmente, ou aguarde novos agendamentos.' : 'Os agendamentos futuros aparecerão aqui.'}</p></div> : <div className="catalog-cards">{items.map(item => <article className="card catalog-card" key={item.id}>
        <div className="catalog-card-top"><span className="eyebrow">{item.phone}</span></div>
        <h3>{item.name}</h3>
        {item.email && <p className="catalog-card-detail">{item.email}</p>}
        {item.notes ? <p className="catalog-description"><strong>Anotações:</strong> {item.notes}</p> : <p className="catalog-description" style={{ color: 'var(--color-muted)' }}>Sem anotações.</p>}
        
        {canUpdate && <div className="catalog-card-actions"><button type="button" className="button secondary" aria-label={`Editar ${item.name}`} disabled={busy || !!feedback?.conflict} onClick={() => openEditor(item)}>Editar</button></div>}
      </article>)}</div>}
      <nav className="catalog-actions" aria-label="Páginas de clientes"><button type="button" className="button secondary" disabled={busy || page === 1} onClick={() => void reload(page - 1)}>Anterior</button><span>Página {page}</span><button type="button" className="button secondary" disabled={busy || !hasMore} onClick={() => void reload(page + 1)}>Próxima</button></nav>
    </section>
  </div>;
}

function CustomerEditor({ entry, disabled, onInvalid, onSave }: { entry?: CustomerView; disabled: boolean; onInvalid: (message: string) => void; onSave: (input: CustomerInput, entry?: CustomerView) => Promise<void>; }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const enteredPhone = String(form.get('phone') || '').trim();
    const compactPhone = enteredPhone.replace(/[\s().-]/g, '');
    const phone = /^\d{10,11}$/.test(compactPhone) ? `+55${compactPhone}` : compactPhone;
    const email = String(form.get('email') || '').trim();
    const notes = String(form.get('notes') || '').trim();
    
    if (!name || name.length > 120) { onInvalid('Informe um nome com até 120 caracteres.'); return; }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) { onInvalid('Informe o telefone com DDD ou use + e o código do país para números internacionais.'); return; }
    
    await onSave({ name, phone, email: email || null, notes: notes || null, expectedVersion: entry?.version }, entry);
  }

  return <form className="catalog-form" onSubmit={submit}>
    <fieldset disabled={disabled} className="catalog-fields">
      <div className="catalog-form-grid">
        <label className="catalog-field">Nome do cliente<input name="name" defaultValue={entry?.name || ''} required maxLength={120} autoComplete="off" /></label>
        <label className="catalog-field">Celular<input aria-label="Celular" name="phone" type="tel" defaultValue={entry?.phone || ''} required maxLength={30} autoComplete="tel" placeholder="Ex: (11) 99999-9999" /><small>Informe o DDD. Para outro país, comece com + e o código do país.</small></label>
        <label className="catalog-field">E-mail (opcional)<input name="email" type="email" defaultValue={entry?.email || ''} maxLength={255} autoComplete="off" /></label>
      </div>
      <label className="catalog-field">Anotações internas<textarea name="notes" rows={4} maxLength={2000} defaultValue={entry?.notes || ''} placeholder="Ex: Cliente VIP, prefere corte com tesoura..." /><small>Visível apenas para a equipe da barbearia.</small></label>
      <button className="button" type="submit">{disabled ? 'Aguarde…' : `Salvar Cliente`}</button>
    </fieldset>
  </form>;
}
