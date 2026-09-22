'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { manageUser } from './actions';

type Membership = { id: string; tenantId: string; roleId: string; status: string; role: { key: string; name: string }; tenant: { name: string; slug: string } };
export interface AdminUserDetail {
  id: string; name: string; email: string; emailVerified: boolean; platformRole: 'USER' | 'SUPER_ADMIN'; createdAt: string; updatedAt: string; hasPassword: boolean;
  memberships: Membership[]; _count: { sessions: number };
  tenantOptions: { id: string; name: string; slug: string; status: string }[]; roleOptions: { id: string; key: string; name: string }[];
}

export function UserManager({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [removingMembershipId, setRemovingMembershipId] = useState<string | null>(null);
  async function run(body: unknown, success: string, reset = false) {
    if (busy) return;
    setBusy(true); setMessage(null);
    const result = await manageUser(user.id, body, reset);
    setMessage({ text: result.error ?? success, error: !!result.error });
    if (!result.error) router.refresh();
    setBusy(false);
  }
  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run({ action: 'update', name: String(form.get('name') ?? '').trim(), email: String(form.get('email') ?? '').trim(), platformRole: form.get('platformRole'), emailVerified: form.get('emailVerified') === 'on', expectedUpdatedAt: user.updatedAt }, 'Dados do usuário atualizados.');
  }
  async function setPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const password = String(form.get('password') ?? ''); const confirmation = String(form.get('confirmation') ?? '');
    if (password !== confirmation) { setMessage({ text: 'A confirmação da senha não corresponde.', error: true }); return; }
    if (password.length < 12) { setMessage({ text: 'A senha precisa ter pelo menos 12 caracteres.', error: true }); return; }
    await run({ action: 'set_password', password }, 'Senha definida e sessões anteriores encerradas.');
    element.reset();
  }
  async function saveMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run({ action: 'upsert_membership', tenantId: form.get('tenantId'), roleId: form.get('roleId'), status: form.get('status') }, 'Acesso à barbearia atualizado.');
  }
  return <div className="admin-editor-stack" aria-busy={busy}>
    <div className="admin-detail-summary"><span className={`admin-status ${user.emailVerified ? '' : 'admin-status-warning'}`}>{user.emailVerified ? 'E-mail verificado' : 'E-mail pendente'}</span><span>{user.platformRole === 'SUPER_ADMIN' ? 'Administrador global' : 'Usuário'}</span><span>{user.hasPassword ? 'Senha definida' : 'Sem senha'}</span><span>{user._count.sessions} sessões ativas</span></div>
    {message && <p className={message.error ? 'admin-feedback' : 'admin-save-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Identidade e autoridade</h2><p>Dados globais da conta. Acesso a uma barbearia continua dependendo de vínculo ativo.</p></div></div><form className="admin-form" noValidate onSubmit={saveIdentity}><fieldset disabled={busy}><div className="admin-form-grid"><label>Nome completo<input name="name" required minLength={2} maxLength={120} defaultValue={user.name} /></label><label>E-mail<input name="email" type="email" required maxLength={254} defaultValue={user.email} autoComplete="email" /></label><label>Autoridade na plataforma<select name="platformRole" defaultValue={user.platformRole}><option value="USER">Usuário</option><option value="SUPER_ADMIN">Administrador global</option></select><small>Administrador global acessa todas as ferramentas do back-office.</small></label><label className="admin-checkbox"><input name="emailVerified" type="checkbox" defaultChecked={user.emailVerified} />E-mail verificado</label></div></fieldset><div className="admin-form-actions"><span>Alterações de autoridade ficam registradas na auditoria.</span><button className="button" disabled={busy}>Salvar usuário</button></div></form></section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Senha e sessões</h2><p>Defina uma senha com segurança, envie a recuperação ou encerre acessos ativos.</p></div></div><form className="admin-form" noValidate onSubmit={setPassword}><fieldset disabled={busy}><div className="admin-form-grid"><label>Nova senha<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /><small>De 12 a 128 caracteres. A senha não aparece em logs ou respostas.</small></label><label>Confirmar nova senha<input name="confirmation" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></label></div></fieldset><div className="admin-form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => run({}, 'E-mail de redefinição enviado.', true)}>Enviar redefinição por e-mail</button><button type="button" className="button secondary" disabled={busy || user._count.sessions === 0} onClick={() => run({ action: 'revoke_sessions' }, 'Sessões encerradas.')}>Encerrar todas as sessões</button><button className="button" disabled={busy}>Definir nova senha</button></div></form></section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Acessos às barbearias</h2><p>Adicione ou altere função e situação sem conceder autoridade global.</p></div></div><form className="admin-form" noValidate onSubmit={saveMembership}><fieldset disabled={busy}><div className="admin-form-grid"><label>Barbearia<select name="tenantId" required defaultValue=""><option value="" disabled>Selecione a barbearia</option>{user.tenantOptions.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug}) · {tenant.status}</option>)}</select></label><label>Função<select name="roleId" required defaultValue=""><option value="" disabled>Selecione a função</option>{user.roleOptions.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>Situação<select name="status" defaultValue="ACTIVE"><option value="ACTIVE">Ativo</option><option value="INVITED">Convidado</option><option value="SUSPENDED">Suspenso</option></select></label></div></fieldset><div className="admin-form-actions"><button className="button" disabled={busy}>Adicionar ou atualizar acesso</button></div></form>{user.memberships.length ? <ul className="admin-member-list">{user.memberships.map(membership => <li key={membership.id}><div><strong>{membership.tenant.name}</strong><small>{membership.tenant.slug} · {membership.role.name} · {membership.status}</small></div>{removingMembershipId === membership.id ? <div className="admin-inline-confirm" role="alertdialog" aria-label={`Remover acesso a ${membership.tenant.name}`}><p>Este usuário perderá o acesso a {membership.tenant.name}.</p><button type="button" className="button secondary" disabled={busy} onClick={() => setRemovingMembershipId(null)}>Cancelar</button><button type="button" className="button danger" disabled={busy} onClick={async () => { await run({ action: 'remove_membership', membershipId: membership.id }, 'Acesso removido.'); setRemovingMembershipId(null); }}>Confirmar remoção</button></div> : <button type="button" className="button secondary" disabled={busy} onClick={() => setRemovingMembershipId(membership.id)}>Remover acesso</button>}</li>)}</ul> : <p className="admin-empty">Este usuário ainda não possui acesso a nenhuma barbearia.</p>}</section>
  </div>;
}
