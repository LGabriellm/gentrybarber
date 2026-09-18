'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlanAction } from './actions';

export function NewPlanForm({ plans }: { plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  return <form className="admin-form admin-panel" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const result = await createPlanAction(formData);
      if (result.error) setError(result.error);
      else if (result.key) { router.push('/plans'); router.refresh(); }
    } catch { setError('Não foi possível cadastrar o plano. Tente novamente mais tarde.'); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}><legend>Informações Comerciais</legend><div className="admin-form-grid">
      <label>Identificador interno<input name="key" required minLength={2} maxLength={63} placeholder="ex: basico-v1" pattern="[a-zA-Z0-9_-]+" /><small>Usado pela API para referenciar este plano. Sem espaços.</small></label>
      <label>Nome do plano<input name="name" required minLength={2} maxLength={120} placeholder="Plano Básico" /></label>
      <label style={{ gridColumn: '1 / -1' }}>Descrição<input name="description" maxLength={500} placeholder="Descrição opcional visível apenas no painel administrativo" /></label>
    </div></fieldset>
    <fieldset disabled={busy}><legend>Funcionalidades e limites</legend><label>Copiar funcionalidades de<select name="basePlanId" defaultValue=""><option value="">Configurar depois — manter indisponível</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><small>A cópia é independente: mudanças futuras no plano de origem não alteram este plano.</small></label></fieldset>
    <fieldset disabled={busy}><legend>Valores (em centavos)</legend><div className="admin-form-grid">
      <label>Mensalidade<input type="number" min="0" name="monthlyPriceCents" required defaultValue="0" /><small>ex: 9900 para R$ 99,00</small></label>
      <label>Taxa de Implantação<input type="number" min="0" name="setupFeeCents" required defaultValue="0" /></label>
      <label>Design Personalizado<input type="number" min="0" name="customDesignFeeCents" required defaultValue="0" /></label>
    </div></fieldset>
    {error && <p className="admin-feedback" role="alert" aria-label="Erro no cadastro">{error}</p>}
    <div className="admin-form-actions"><a href="/plans">Cancelar</a><button className="button" type="submit" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar plano'}</button></div>
  </form>;
}
