'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserAction } from './actions';

export function NewUserForm({ tenants }: { tenants: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return <form className="admin-form admin-panel" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const result = await createUserAction(formData);
      if (result.error) setError(result.error);
      else if (result.email) { router.push('/users'); router.refresh(); }
    } catch { setError('Não foi possível cadastrar a conta. Tente novamente mais tarde.'); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}><legend>Nova conta de acesso</legend><div className="admin-form-grid">
      <label>Nome completo<input name="name" required minLength={2} maxLength={120} placeholder="Nome do usuário" /></label>
      <label>E-mail<input type="email" name="email" required maxLength={254} placeholder="usuario@exemplo.com" autoComplete="email" /></label>
      <label>Perfil de acesso<select name="role" required defaultValue="USER"><option value="USER">Usuário Comum (Lojista/Profissional)</option><option value="SUPER_ADMIN">Administrador Global</option></select><small>Administradores têm acesso total ao back-office.</small></label>
    </div></fieldset>
    <fieldset disabled={busy}><legend>Verificação e vínculo</legend><div className="admin-form-grid">
      <label className="admin-checkbox"><input type="checkbox" name="emailVerified" />Marcar e-mail como verificado<small>Permite que o usuário seja utilizado como responsável por uma barbearia imediatamente, sem precisar confirmar o e-mail.</small></label>
      <label>Vincular à barbearia (opcional)<select name="tenantSlug" defaultValue=""><option value="">Nenhuma — cadastrar apenas a conta</option>{tenants.map(t => <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>)}</select><small>O usuário será vinculado como proprietário da barbearia selecionada.</small></label>
    </div></fieldset>
    {error && <p className="admin-feedback" role="alert" aria-label="Erro no cadastro">{error}</p>}
    <div className="admin-form-actions"><a href="/users">Cancelar</a><button className="button" type="submit" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar usuário'}</button></div>
  </form>;
}
