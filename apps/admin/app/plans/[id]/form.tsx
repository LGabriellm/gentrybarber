'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePlanAction, deletePlanAction } from './actions';
import type { AdminPlan } from '../../../components/admin-data';

export function EditPlanForm({ plan }: { plan: AdminPlan }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return <div className="admin-editor-stack">
    <form className="admin-form admin-panel" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const formData = new FormData(event.currentTarget);
      setBusy(true); setError(null); setSuccess(null);
      try {
        const result = await updatePlanAction(plan.id, formData);
        if (result.error) setError(result.error);
        else { setSuccess('Plano atualizado.'); router.refresh(); }
      } catch { setError('Não foi possível atualizar o plano. Tente novamente mais tarde.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}><legend>Informações comerciais</legend><div className="admin-form-grid">
        <label>Identificador interno<input value={plan.key} readOnly /><small>O identificador é preservado para manter referências existentes.</small></label>
        <label>Nome do plano<input name="name" required minLength={2} maxLength={120} defaultValue={plan.name} /></label>
        <label style={{ gridColumn: '1 / -1' }}>Descrição<input name="description" maxLength={500} defaultValue={plan.description ?? ''} placeholder="Descrição opcional visível apenas no painel administrativo" /></label>
      </div></fieldset>
      <fieldset disabled={busy}><legend>Valores (em centavos)</legend><div className="admin-form-grid">
        <label>Mensalidade<input type="number" min="0" name="monthlyPriceCents" required defaultValue={plan.monthlyPriceCents} /><small>ex: 9900 para R$ 99,00</small></label>
        <label>Taxa de Implantação<input type="number" min="0" name="setupFeeCents" required defaultValue={plan.setupFeeCents} /></label>
        <label>Design Personalizado<input type="number" min="0" name="customDesignFeeCents" required defaultValue={plan.customDesignFeeCents} /></label>
      </div></fieldset>
      <fieldset disabled={busy}><legend>Disponibilidade</legend><div className="admin-form-grid">
        <label className="admin-checkbox"><input type="checkbox" name="active" defaultChecked={plan.active} />Disponível para novos ambientes<small>Desativar impede que novas barbearias selecionem este plano. Barbearias existentes não são afetadas.</small></label>
      </div></fieldset>
      {error && <p className="admin-feedback" role="alert" aria-label="Erro ao salvar">{error}</p>}
      {success && <p className="admin-save-success" role="status">{success}</p>}
      <div className="admin-form-actions"><a href="/plans">Voltar à lista</a><button className="button" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar plano'}</button></div>
    </form>

    <section className="admin-panel">
      <div className="admin-panel-heading"><div><h2>Remover plano</h2><p>Esta ação é irreversível. Somente planos sem barbearias vinculadas podem ser removidos.</p></div></div>
      {!confirmDelete
        ? <div className="admin-form-actions"><button type="button" className="button destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>Remover plano</button></div>
        : <div className="admin-form-actions" style={{ gap: '0.75rem' }}>
            <span>Confirmar a remoção de <strong>{plan.name}</strong>?</span>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button type="button" className="button destructive" disabled={busy} onClick={async () => {
              setBusy(true); setError(null); setSuccess(null);
              try {
                const result = await deletePlanAction(plan.id);
                if (result.error) { setError(result.error); setConfirmDelete(false); }
                else { router.push('/plans'); router.refresh(); }
              } catch { setError('Não foi possível remover o plano.'); setConfirmDelete(false); }
              finally { setBusy(false); }
            }}>{busy ? 'Removendo…' : 'Confirmar remoção'}</button>
          </div>
      }
    </section>
  </div>;
}
