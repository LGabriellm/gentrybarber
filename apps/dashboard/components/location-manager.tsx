'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { LocationItem, LocationCatalog, CreateLocationInput, UpdateLocationInput } from '@platform/types';

type Input = CreateLocationInput | UpdateLocationInput;
type Feedback = { text: string; error: boolean; conflict?: boolean; signIn?: boolean } | null;

const failureMessages: Record<number, string> = {
  400: 'Revise os campos e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Seu acesso a este recurso mudou. Consulte o responsável pela barbearia ou plano.',
  404: 'A unidade não foi encontrada.',
  409: 'Esta unidade foi alterada por outra pessoa. Recarregue os dados antes de editar.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um momento.',
};

export function LocationManager({ slug, initialData }: { slug: string; initialData: LocationCatalog }) {
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState<LocationItem | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const apiPath = `/api/tenants/${encodeURIComponent(slug)}/locations`;
  const items = data.locations;

  function announce(value: Feedback) {
    setFeedback(value);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  function openEditor(entry: LocationItem | 'new') {
    setEditing(entry);
    setFeedback(null);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      editorRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    });
  }

  async function save(input: Input, entry?: LocationItem) {
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
      const saved = await response.json() as LocationItem;
      setData(previous => {
        const next = [...previous.locations.filter(item => item.id !== saved.id), saved].sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.name.localeCompare(b.name, 'pt-BR');
        });
        return { locations: next };
      });
      setEditing(null);
      announce({ text: `Unidade ${entry ? 'atualizada' : 'cadastrada'} com sucesso.`, error: false });
    } catch {
      announce({ text: 'Não foi possível confirmar o salvamento. Recarregue os dados antes de tentar novamente.', error: true, conflict: true });
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(apiPath, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        announce({ text: failureMessages[response.status] || 'Não foi possível recarregar. Tente novamente.', error: true, conflict: feedback?.conflict, signIn: response.status === 401 });
        return;
      }
      const fresh = await response.json() as LocationCatalog;
      setData(fresh);
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
      <div className="catalog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={reload}>{busy ? 'Aguarde…' : 'Recarregar dados'}</button>
        <button type="button" className="button" disabled={busy || !!feedback?.conflict} onClick={() => openEditor('new')}>Nova unidade</button>
      </div>
    </div>
    
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`catalog-feedback ${feedback.error ? 'catalog-feedback-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
      <p>{feedback.text}</p>{feedback.signIn && <a href="/login">Entrar novamente</a>}
      {feedback.conflict && <button className="button secondary" type="button" disabled={busy} onClick={reload}>Recarregar e descartar formulário</button>}
    </div>}
    
    {editing && <section ref={editorRef} className="panel catalog-editor" aria-label={editing === 'new' ? `Nova unidade` : `Editar unidade`}>
      <div className="section-heading"><h2>{editing === 'new' ? `Nova unidade` : `Editar unidade`}</h2><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></div>
      <LocationEditor key={editing === 'new' ? 'new-location' : `${editing.id}-${editing.version}`} entry={editing === 'new' ? undefined : editing} disabled={busy || !!feedback?.conflict} onInvalid={text => announce({ text, error: true })} onSave={save} />
    </section>}
    
    <section className="catalog-list" aria-label="Lista de unidades">
      <div className="catalog-list-heading"><h2>Unidades da Barbearia</h2><span>{items.length} {items.length === 1 ? 'unidade' : 'unidades'}</span></div>
      {items.length === 0 ? <div className="panel catalog-empty"><h3>Nenhuma unidade cadastrada.</h3><p>Use “Nova unidade” para criar o seu primeiro local de atendimento.</p></div> : <div className="catalog-cards">{items.map(item => <article className="card catalog-card" key={item.id}>
        <div className="catalog-card-top">
          <span className="eyebrow">{item.slug}</span>
          <span className={`catalog-status ${item.active ? '' : 'catalog-status-inactive'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
        </div>
        <h3>{item.name}</h3>
        <p className="catalog-description">
          {item.address?.city}{item.address?.state ? ` - ${item.address.state}` : ''}
        </p>
        <p className="catalog-card-detail">{item.phone || 'Sem telefone cadastrado'}</p>
        
        <div className="catalog-card-actions">
          <button type="button" className="button secondary" aria-label={`Editar ${item.name}`} disabled={busy || !!feedback?.conflict} onClick={() => openEditor(item)}>Editar</button>
          <button type="button" className="catalog-text-button" aria-label={`${item.active ? 'Desativar' : 'Reativar'} ${item.name}`} disabled={busy || !!feedback?.conflict} onClick={() => save({ name: item.name, address: item.address, phone: item.phone, active: !item.active, expectedVersion: item.version }, item)}>{item.active ? 'Desativar' : 'Reativar'}</button>
        </div>
      </article>)}</div>}
    </section>
  </div>;
}

function LocationEditor({ entry, disabled, onInvalid, onSave }: {
  entry?: LocationItem; disabled: boolean; onInvalid: (message: string) => void; onSave: (input: Input, entry?: LocationItem) => Promise<void>;
}) {
  const idPrefix = `location-editor`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const city = String(form.get('city') || '').trim();
    const state = String(form.get('state') || '').trim();
    const active = form.get('active') === 'on';

    if (!name || name.length > 120) { onInvalid('Informe um nome com até 120 caracteres.'); return; }
    
    const address = { city, state };
    const identity = entry ? { expectedVersion: entry.version } : {};

    await onSave({ name, address, phone: phone || null, active, ...identity }, entry);
  }

  return <form className="catalog-form" onSubmit={submit}>
    <fieldset disabled={disabled} className="catalog-fields">
      <div className="catalog-form-grid">
        <label className="catalog-field" htmlFor={`${idPrefix}-name`}>Nome da Unidade<input id={`${idPrefix}-name`} name="name" defaultValue={entry?.name || ''} required maxLength={120} autoComplete="off" /></label>
        <label className="catalog-field" htmlFor={`${idPrefix}-phone`}>Telefone<input id={`${idPrefix}-phone`} name="phone" defaultValue={entry?.phone || ''} maxLength={20} autoComplete="tel" /></label>
        <label className="catalog-field" htmlFor={`${idPrefix}-city`}>Cidade<input id={`${idPrefix}-city`} name="city" defaultValue={entry?.address?.city || ''} maxLength={60} autoComplete="address-level2" /></label>
        <label className="catalog-field" htmlFor={`${idPrefix}-state`}>Estado (UF)<input id={`${idPrefix}-state`} name="state" defaultValue={entry?.address?.state || ''} maxLength={2} autoComplete="address-level1" /></label>
      </div>
      
      <label className="catalog-checkbox"><input name="active" type="checkbox" defaultChecked={entry?.active ?? true} />Unidade ativa</label>
      <p className="catalog-note">Unidades inativas não recebem agendamentos nem aparecem no site.</p>
      
      <button className="button" type="submit">{disabled ? 'Aguarde…' : `Salvar unidade`}</button>
    </fieldset>
  </form>;
}
