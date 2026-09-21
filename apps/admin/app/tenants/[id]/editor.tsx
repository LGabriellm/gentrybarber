'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminPlan } from '../../../components/admin-data';
import { saveBarbershop } from './actions';

export interface AdminLocation { id: string; name: string; slug: string; timezone: string; phone: string | null; active: boolean; version: number; address: { street?: string; address?: string; city?: string; state?: string; country?: string } }
export interface BarbershopDetail {
  id: string; name: string; slug: string; status: string; planId: string; timezone: string; email: string | null; phone: string | null; whatsapp: string | null; updatedAt: string;
  plan: { id: string; name: string; active: boolean }; locations: AdminLocation[];
  siteConfiguration: { published: boolean; publishedThemeVersionId: string | null } | null;
  memberships: { id: string; status: string; role: { name: string; key: string }; user: { name: string; email: string } }[];
  _count: { services: number; professionals: number };
}
function Feedback({ error, success }: { error: string | null; success: string | null }) {
  return <>{error && <div className="admin-feedback" role="alert" aria-label="Erro ao salvar"><p>{error}</p><button type="button" className="button secondary" onClick={() => window.location.reload()}>Recarregar dados</button></div>}{success && <p className="admin-save-success" role="status">{success}</p>}</>;
}
export function BarbershopForm({ tenant, plans }: { tenant: BarbershopDetail; plans: AdminPlan[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await saveBarbershop(tenant.id, 'details', null, { name: value('name'), email: value('email') || null, phone: value('phone') || null, whatsapp: value('whatsapp') || null, timezone: value('timezone'), status: value('status'), planId: value('planId'), expectedUpdatedAt: tenant.updatedAt });
      if (result.error) setError(result.error);
      else { setSuccess('Configurações salvas.'); router.refresh(); }
    } catch { setError('Não foi possível confirmar a alteração. Recarregue para conferir.'); }
    finally { setBusy(false); }
  }
  return <section id="configuracao" className="admin-panel"><div className="admin-panel-heading"><div><h2>Dados e configuração</h2><p>Identidade, contatos e acesso ao ambiente.</p></div></div><form className="admin-form" onSubmit={submit}>
    <fieldset disabled={busy}><legend>Informações da barbearia</legend><div className="admin-form-grid">
      <label>Nome da barbearia<input name="name" required minLength={2} maxLength={120} defaultValue={tenant.name} /></label>
      <label>Identificador<input value={tenant.slug} readOnly /><small>O identificador é preservado para manter os endereços existentes.</small></label>
      <label>E-mail de contato<input type="email" name="email" maxLength={254} defaultValue={tenant.email ?? ''} /></label>
      <label>Telefone<input type="tel" name="phone" maxLength={30} defaultValue={tenant.phone ?? ''} /></label>
      <label>WhatsApp de contato<input type="tel" name="whatsapp" maxLength={30} defaultValue={tenant.whatsapp ?? ''} /><small>Número exibido no site para contato direto.</small></label>
      <label>Fuso horário<input name="timezone" required maxLength={100} list="admin-timezones" defaultValue={tenant.timezone} /><datalist id="admin-timezones"><option value="America/Sao_Paulo" /><option value="America/Manaus" /><option value="America/Rio_Branco" /><option value="America/Noronha" /></datalist><small>Usado por novas unidades. As unidades e os atendimentos existentes conservam seu fuso.</small></label>
    </div></fieldset>
    <fieldset disabled={busy}><legend>Plano e acesso</legend><div className="admin-form-grid">
      <label>Plano<select aria-label="Plano da barbearia" name="planId" defaultValue={tenant.planId}>{!plans.some(plan => plan.id === tenant.planId) && <option value={tenant.planId}>{tenant.plan.name} · plano atual</option>}{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><small>A alteração muda os recursos disponíveis. Cobranças são tratadas separadamente.</small></label>
      <label>Situação<select aria-label="Situação da barbearia" name="status" defaultValue={tenant.status}><option value="ACTIVE">Ativa</option><option value="TRIAL">Em avaliação</option><option value="SUSPENDED">Suspensa</option><option value="CANCELED">Encerrada</option></select><small>Somente ambientes ativos permitem acesso operacional. Suspender ou encerrar conserva os dados.</small></label>
    </div></fieldset>
    <Feedback error={error} success={success} /><div className="admin-form-actions"><span>Alterações registradas no histórico de auditoria.</span><button className="button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configurações'}</button></div>
  </form></section>;
}
export function LocationManager({ tenant }: { tenant: BarbershopDetail }) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdminLocation | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const body = { name: value('name'), phone: value('phone') || null, active: form.get('active') === 'on', address: { ...(selected?.address ?? {}), street: value('street'), city: value('city'), state: value('state') }, ...(selected ? { expectedVersion: selected.version } : {}) };
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await saveBarbershop(tenant.id, 'location', selected?.id ?? null, body);
      if (result.error) setError(result.error);
      else { setSuccess(selected ? 'Unidade atualizada.' : 'Unidade cadastrada.'); setOpen(false); setSelected(null); router.refresh(); }
    } catch { setError('Não foi possível confirmar a alteração. Recarregue para conferir.'); }
    finally { setBusy(false); }
  }
  return <section id="unidades" className="admin-panel"><div className="admin-panel-heading"><div><h2>Unidades</h2><p>Estruture os locais de atendimento da barbearia.</p></div><button className="button secondary" disabled={busy} onClick={() => { setSelected(null); setOpen(true); setError(null); setSuccess(null); }}>Nova unidade</button></div>
    <div className="admin-location-grid">{tenant.locations.map(location => <article className="admin-location-card" key={location.id}><div><h3>{location.name}</h3><span className={`admin-status ${location.active ? '' : 'admin-status-muted'}`}>{location.active ? 'Ativa' : 'Inativa'}</span></div><p>{[location.address.street || location.address.address, location.address.city, location.address.state].filter(Boolean).join(' · ') || 'Endereço não informado'}</p><small>{location.phone || 'Telefone não informado'} · {location.timezone}</small><button type="button" className="button secondary" aria-label={`Editar unidade ${location.name}`} disabled={busy} onClick={() => { setSelected(location); setOpen(true); setError(null); setSuccess(null); }}>Editar unidade</button></article>)}</div>
    {!tenant.locations.length && <p className="admin-empty">Cadastre a primeira unidade para estruturar os atendimentos.</p>}
    <div className="admin-location-feedback"><Feedback error={error} success={success} /></div>
    {open && <form key={selected ? `${selected.id}:${selected.version}` : 'new'} className="admin-form admin-location-form" onSubmit={submit}><fieldset disabled={busy}><legend>{selected ? `Editar ${selected.name}` : 'Cadastrar unidade'}</legend><div className="admin-form-grid">
      <label>Nome da unidade<input name="name" required maxLength={120} defaultValue={selected?.name ?? ''} /></label><label>Telefone da unidade<input type="tel" name="phone" maxLength={30} defaultValue={selected?.phone ?? ''} /></label>
      <label>Endereço<input name="street" maxLength={200} defaultValue={selected?.address.street || selected?.address.address || ''} /></label><label>Cidade<input name="city" maxLength={120} defaultValue={selected?.address.city ?? ''} /></label><label>Estado<input name="state" maxLength={120} defaultValue={selected?.address.state ?? ''} /></label>
      <label className="admin-checkbox"><input type="checkbox" name="active" defaultChecked={selected?.active ?? true} />Unidade ativa</label>
    </div><p className="admin-field-help">Unidades ativas respeitam os recursos e limites do plano. Uma unidade com atendimentos futuros não pode ser desativada.</p></fieldset><div className="admin-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancelar edição</button><button className="button" disabled={busy}>{busy ? 'Salvando…' : selected ? 'Salvar unidade' : 'Cadastrar unidade'}</button></div></form>}
  </section>;
}
