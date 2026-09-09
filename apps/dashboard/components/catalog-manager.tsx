'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogLocation, CatalogProfessional, CatalogService, CreateProfessionalInput, CreateServiceInput, ProfessionalCatalog, ServiceCatalog, UpdateProfessionalInput, UpdateServiceInput } from '@platform/types';
import { formatPrice, formatPriceInput, parsePriceCents } from '../lib/catalog-format';

type Resource = 'services' | 'professionals';
type Entry = CatalogService | CatalogProfessional;
type Catalog = ServiceCatalog | ProfessionalCatalog;
type Input = CreateServiceInput | UpdateServiceInput | CreateProfessionalInput | UpdateProfessionalInput;
type Feedback = { text: string; error: boolean; conflict?: boolean; signIn?: boolean } | null;

const failureMessages: Record<number, string> = {
  400: 'Revise os campos e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Seu acesso a este catálogo mudou. Consulte o responsável pela barbearia.',
  404: 'O registro ou uma das opções não está mais disponível nesta barbearia. Recarregue os dados.',
  409: 'Este registro foi alterado por outra pessoa. Recarregue os dados antes de editar novamente; seu formulário será descartado.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um momento antes de tentar novamente.',
};

function fieldsFromEntry(entry: Entry) {
  if ('priceCents' in entry) return { name: entry.name, description: entry.description, durationMinutes: entry.durationMinutes, priceCents: entry.priceCents, active: entry.active };
  return { name: entry.name, bio: entry.bio, active: entry.active, serviceIds: entry.serviceIds };
}

export function CatalogManager({ slug, resource, initialData }: { slug: string; resource: Resource; initialData: Catalog }) {
  const [data, setData] = useState(initialData);
  const [location, setLocation] = useState('');
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const services = resource === 'services';
  const singular = services ? 'serviço' : 'profissional';
  const apiPath = `/api/tenants/${encodeURIComponent(slug)}/${resource}`;
  const items: Entry[] = data.items.filter(item => !location || item.locationId === location);
  const locations = new Map(data.locations.map(item => [item.id, item]));
  const serviceOptions = 'services' in data ? data.services : [];
  const hasActiveLocation = data.locations.some(item => item.active);

  function announce(value: Feedback) {
    setFeedback(value);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }

  function openEditor(entry: Entry | 'new') {
    setEditing(entry);
    setFeedback(null);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      editorRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    });
  }

  async function save(input: Input, entry?: Entry) {
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
      const saved = await response.json() as Entry;
      setData(previous => {
        const next = [...previous.items.filter(item => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        return 'services' in previous
          ? { ...previous, items: next as CatalogProfessional[] }
          : { ...previous, items: next as CatalogService[] };
      });
      setEditing(null);
      setLocation(saved.locationId);
      announce({ text: `${services ? 'Serviço' : 'Profissional'} ${entry ? 'atualizado' : 'cadastrado'} com sucesso.`, error: false });
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
      const fresh = await response.json() as Catalog;
      setData(fresh);
      setEditing(null);
      if (!fresh.locations.some(item => item.id === location)) setLocation('');
      announce({ text: 'Dados atualizados. Você pode abrir o registro para editar novamente.', error: false });
    } catch {
      announce({ text: 'Não foi possível recarregar os dados. Verifique sua conexão e tente novamente.', error: true, conflict: feedback?.conflict });
    } finally {
      setBusy(false);
    }
  }

  return <div className="catalog-manager" aria-busy={busy}>
    <div className="catalog-toolbar">
      <label className="catalog-filter">Filtrar por unidade<select value={location} onChange={event => setLocation(event.target.value)} disabled={busy}>
        <option value="">Todas as unidades</option>{data.locations.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inativa)'}</option>)}
      </select></label>
      <div className="catalog-actions"><button type="button" className="button secondary" disabled={busy} onClick={reload}>{busy ? 'Aguarde…' : 'Recarregar dados'}</button><button type="button" className="button" disabled={busy || !hasActiveLocation || !!feedback?.conflict} onClick={() => openEditor('new')}>Novo {singular}</button></div>
    </div>
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`catalog-feedback ${feedback.error ? 'catalog-feedback-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>
      <p>{feedback.text}</p>{feedback.signIn && <a href="/login">Entrar novamente</a>}
      {feedback.conflict && <button className="button secondary" type="button" disabled={busy} onClick={reload}>Recarregar e descartar formulário</button>}
    </div>}
    {!hasActiveLocation && <p className="notice">Não há unidades ativas para novos cadastros. Peça ao responsável pelo ambiente para ativar uma unidade.</p>}
    {editing && <section ref={editorRef} className="panel catalog-editor" aria-label={editing === 'new' ? `Novo ${singular}` : `Editar ${singular}`}>
      <div className="section-heading"><h2>{editing === 'new' ? `Novo ${singular}` : `Editar ${singular}`}</h2><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></div>
      <CatalogEditor key={editing === 'new' ? `new-${resource}` : `${editing.id}-${editing.version}`} resource={resource} entry={editing === 'new' ? undefined : editing} locations={data.locations} services={serviceOptions} defaultLocation={location} disabled={busy || !!feedback?.conflict} onInvalid={text => announce({ text, error: true })} onSave={save} />
    </section>}
    <section className="catalog-list" aria-label={`Lista de ${services ? 'serviços' : 'profissionais'}`}>
      <div className="catalog-list-heading"><h2>{services ? 'Catálogo de serviços' : 'Equipe da barbearia'}</h2><span>{items.length} {items.length === 1 ? 'cadastro' : 'cadastros'}</span></div>
      {items.length === 0 ? <div className="panel catalog-empty"><h3>{services ? 'Nenhum serviço cadastrado' : 'Nenhum profissional cadastrado'}{location ? ' nesta unidade' : ''}.</h3><p>{hasActiveLocation ? `Use “Novo ${singular}” para começar a organizar ${services ? 'seu catálogo' : 'sua equipe'}.` : 'Uma unidade ativa é necessária para começar.'}</p></div> : <div className="catalog-cards">{items.map(item => <article className="card catalog-card" key={item.id}>
        <div className="catalog-card-top"><span className="eyebrow">{locations.get(item.locationId)?.name ?? 'Unidade indisponível'}</span><span className={`catalog-status ${item.active ? '' : 'catalog-status-inactive'}`}>{item.active ? 'Ativo' : 'Inativo'}</span></div>
        <h3>{item.name}</h3>
        {'priceCents' in item ? <><p className="catalog-card-detail">{formatPrice(item.priceCents)} <span>· {item.durationMinutes} minutos</span></p><p className="catalog-description">{item.description || 'Sem descrição.'}</p></> : <><p className="catalog-description">{item.bio || 'Sem apresentação.'}</p><div className="catalog-tags" aria-label={`Serviços de ${item.name}`}>{item.serviceIds.length ? item.serviceIds.map(id => { const service = serviceOptions.find(option => option.id === id); return <span key={id}>{service?.name ?? 'Serviço indisponível'}{service && !service.active ? ' (inativo)' : ''}</span>; }) : <span>Nenhum serviço vinculado</span>}</div></>}
        {!locations.get(item.locationId)?.active && <p className="catalog-note">Unidade inativa: este cadastro não aparece no site.</p>}
        <div className="catalog-card-actions"><button type="button" className="button secondary" aria-label={`Editar ${item.name}`} disabled={busy || !!feedback?.conflict} onClick={() => openEditor(item)}>Editar</button><button type="button" className="catalog-text-button" aria-label={`${item.active ? 'Desativar' : 'Reativar'} ${item.name}`} disabled={busy || !!feedback?.conflict} onClick={() => save({ ...fieldsFromEntry(item), active: !item.active, expectedVersion: item.version }, item)}>{item.active ? 'Desativar' : 'Reativar'}</button></div>
      </article>)}</div>}
    </section>
  </div>;
}

function CatalogEditor({ resource, entry, locations, services, defaultLocation, disabled, onInvalid, onSave }: {
  resource: Resource; entry?: Entry; locations: CatalogLocation[]; services: ProfessionalCatalog['services'];
  defaultLocation: string; disabled: boolean; onInvalid: (message: string) => void; onSave: (input: Input, entry?: Entry) => Promise<void>;
}) {
  const activeLocations = locations.filter(item => item.active);
  const [locationId, setLocationId] = useState(entry?.locationId || (activeLocations.some(item => item.id === defaultLocation) ? defaultLocation : activeLocations[0]?.id || ''));
  const [selectedServices, setSelectedServices] = useState<string[]>(entry && 'serviceIds' in entry ? entry.serviceIds : []);
  const isService = resource === 'services';
  const availableServices = services.filter(item => item.locationId === locationId);
  const idPrefix = `catalog-${resource}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const detail = String(form.get('detail') || '').trim();
    if (!name || name.length > 120) { onInvalid('Informe um nome com até 120 caracteres.'); return; }
    if (detail.length > 2_000) { onInvalid('A descrição ou apresentação deve ter até 2.000 caracteres.'); return; }
    if (!entry && !activeLocations.some(item => item.id === locationId)) { onInvalid('Selecione uma unidade ativa.'); return; }
    const active = form.get('active') === 'on';
    const identity = entry ? { expectedVersion: entry.version } : { locationId };
    if (isService) {
      const priceCents = parsePriceCents(String(form.get('price') || ''));
      const durationText = String(form.get('duration') || '');
      const durationMinutes = Number(durationText);
      if (priceCents === null) { onInvalid('Informe um preço entre R$ 0,00 e R$ 1.000.000,00, com até duas casas decimais e sem separador de milhar.'); return; }
      if (!/^\d+$/.test(durationText) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1_440) { onInvalid('Informe uma duração inteira entre 1 e 1.440 minutos.'); return; }
      await onSave({ name, description: detail || null, priceCents, durationMinutes, active, ...identity }, entry);
    } else {
      if (selectedServices.length > 100 || selectedServices.some(id => !availableServices.some(item => item.id === id))) { onInvalid('Selecione até 100 serviços desta unidade. Recarregue os dados se as opções mudaram.'); return; }
      await onSave({ name, bio: detail || null, active, serviceIds: selectedServices, ...identity }, entry);
    }
  }

  return <form className="catalog-form" onSubmit={submit}>
    <fieldset disabled={disabled} className="catalog-fields">
      <div className="catalog-form-grid">
        <label className="catalog-field" htmlFor={`${idPrefix}-name`}>{isService ? 'Nome do serviço' : 'Nome do profissional'}<input id={`${idPrefix}-name`} name="name" defaultValue={entry?.name || ''} required maxLength={120} autoComplete="off" /></label>
        <label className="catalog-field" htmlFor={`${idPrefix}-location`}>Unidade{entry ? <><input id={`${idPrefix}-location`} value={locations.find(item => item.id === locationId)?.name || 'Unidade indisponível'} readOnly /><small>A unidade de um cadastro existente não pode ser alterada.</small></> : <select id={`${idPrefix}-location`} value={locationId} required onChange={event => { setLocationId(event.target.value); setSelectedServices([]); }}><option value="" disabled>Selecione a unidade</option>{activeLocations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</label>
        {isService && <><label className="catalog-field" htmlFor={`${idPrefix}-price`}>Preço (R$)<input id={`${idPrefix}-price`} name="price" inputMode="decimal" required defaultValue={entry && 'priceCents' in entry ? formatPriceInput(entry.priceCents) : ''} placeholder="Ex.: 45,90" aria-describedby={`${idPrefix}-price-hint`} /><small id={`${idPrefix}-price-hint`}>Até duas casas decimais, sem separador de milhar.</small></label><label className="catalog-field" htmlFor={`${idPrefix}-duration`}>Duração (minutos)<input id={`${idPrefix}-duration`} name="duration" type="number" inputMode="numeric" min={1} max={1440} step={1} required defaultValue={entry && 'durationMinutes' in entry ? entry.durationMinutes : ''} /></label></>}
      </div>
      <label className="catalog-field" htmlFor={`${idPrefix}-detail`}>{isService ? 'Descrição' : 'Bio'}<textarea id={`${idPrefix}-detail`} name="detail" rows={4} maxLength={2000} defaultValue={entry ? 'description' in entry ? entry.description || '' : entry.bio || '' : ''} /><small>Opcional. Até 2.000 caracteres.</small></label>
      {!isService && <fieldset className="catalog-services"><legend>Serviços</legend><p>Selecione os serviços realizados nesta unidade. Vínculos com serviços inativos são preservados.</p>{availableServices.length ? <div className="catalog-service-options">{availableServices.map(item => <label key={item.id} className="catalog-checkbox"><input type="checkbox" checked={selectedServices.includes(item.id)} onChange={event => setSelectedServices(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />{item.name}{item.active ? '' : ' (inativo)'}</label>)}</div> : <p className="notice">Esta unidade ainda não possui serviços. Você pode cadastrar o profissional e vincular os serviços depois.</p>}<small>{selectedServices.length} de 100 serviços selecionados</small></fieldset>}
      <label className="catalog-checkbox"><input name="active" type="checkbox" defaultChecked={entry?.active ?? true} />Ativo no catálogo</label>
      <p className="catalog-note">Cadastros inativos ficam disponíveis para edição e não aparecem no site público.</p>
      <button className="button" type="submit">{disabled ? 'Aguarde…' : `Salvar ${isService ? 'serviço' : 'profissional'}`}</button>
    </fieldset>
  </form>;
}
