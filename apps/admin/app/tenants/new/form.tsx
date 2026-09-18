'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createTenantAction } from './actions';

export function NewTenantForm({ plans }: { plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form className="admin-form admin-panel" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const result = await createTenantAction(formData);
      if (result.error) setError(result.error);
      else if (result.slug) { router.push(`/tenants?q=${encodeURIComponent(result.slug)}`); router.refresh(); }
    } catch { setError('Não foi possível confirmar o cadastro. Consulte a lista antes de tentar novamente.'); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}><legend>01 · Dados da barbearia</legend><div className="admin-form-grid">
      <label>Nome da barbearia<input name="name" required minLength={2} maxLength={120} placeholder="Como a barbearia é conhecida" /></label>
      <label>Identificador do ambiente<input name="slug" required minLength={2} maxLength={63} placeholder="minha-barbearia" pattern="[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?" /><small>Letras minúsculas, números e hífens. Usado no endereço do ambiente.</small></label>
      <label>Plano<select aria-label="Plano" name="planId" required defaultValue=""><option value="" disabled>Selecione um plano</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      <label>Fuso horário<select aria-label="Fuso horário" name="timezone" defaultValue="America/Sao_Paulo"><option value="America/Sao_Paulo">Brasília · São Paulo</option><option value="America/Manaus">Manaus</option><option value="America/Rio_Branco">Rio Branco</option><option value="America/Noronha">Fernando de Noronha</option><option value="America/Belem">Belém</option><option value="America/Cuiaba">Cuiabá</option></select><small>A primeira unidade usará este fuso horário.</small></label>
    </div></fieldset>
    <fieldset disabled={busy}><legend>02 · Responsável pelo ambiente</legend><div className="admin-form-grid"><label>E-mail do responsável<input type="email" name="ownerEmail" required maxLength={254} placeholder="nome@exemplo.com" autoComplete="email" /><small>Informe uma conta já cadastrada e com e-mail verificado. A pessoa receberá acesso de proprietário a esta barbearia.</small></label><div><p style={{ fontSize: 12, marginBottom: 0 }}>O cadastro cria a barbearia, o vínculo com o responsável e a unidade principal. A conta existente mantém sua senha e seus outros acessos.</p></div></div></fieldset>
    {error && <p className="admin-feedback" role="alert" aria-label="Erro no cadastro">{error}</p>}
    <div className="admin-form-actions"><a href="/tenants">Voltar à lista</a><button className="button" type="submit" disabled={busy || !plans.length}>{busy ? 'Cadastrando…' : 'Cadastrar barbearia'}</button></div>
  </form>;
}

