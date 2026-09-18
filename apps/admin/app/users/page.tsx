import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../components/admin-layout';
import { Pagination, listQuery, count, type AdminUser, type AdminPage } from '../../components/admin-data';
export const dynamic = 'force-dynamic';
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = listQuery(await searchParams);
  const data = await apiGet<AdminPage<AdminUser>>(`/v1/admin/users?${query}`);
  return <AdminLayout activeTab="users" title="Usuários" description="Consulte as contas da plataforma, seus perfis de acesso e a verificação de e-mail." action={<a href="/users/new" className="button"><span aria-hidden="true">＋</span> Novo usuário</a>}>
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Contas cadastradas</h2><p>{count(data.total)} usuários encontrados</p></div></div>
      <form className="admin-filters" action="/users"><label className="admin-filter-field">Buscar usuário<input name="q" defaultValue={query.get('q') ?? ''} placeholder="Nome ou e-mail" maxLength={120} /></label><label className="admin-filter-field">Filtrar contas<select aria-label="Filtrar contas" name="status" defaultValue={query.get('status') ?? ''}><option value="">Todas as contas</option><option value="verified">E-mail verificado</option><option value="pending">E-mail pendente</option><option value="admin">Administradores globais</option></select></label><button className="button secondary">Aplicar filtros</button>{query.size > 0 && <a href="/users">Limpar filtros</a>}</form>
      {!data.items.length ? <div className="admin-empty"><h2>Nenhum usuário encontrado</h2><p>Tente buscar por outro nome ou e-mail.</p></div> : <table className="admin-table"><thead><tr><th scope="col">Usuário</th><th scope="col">Perfil</th><th scope="col">E-mail</th><th scope="col">Cadastro</th></tr></thead><tbody>{data.items.map(user => <tr key={user.id}><td><div className="admin-identity"><span className="admin-avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td data-label="Perfil">{user.platformRole === 'SUPER_ADMIN' ? 'Administrador global' : 'Usuário'}</td><td data-label="E-mail"><span className={`admin-status ${user.emailVerified ? '' : 'admin-status-warning'}`}>{user.emailVerified ? 'Verificado' : 'Pendente'}</span></td><td data-label="Cadastro">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(user.createdAt))}</td></tr>)}</tbody></table>}
      <Pagination {...data} path="/users" query={query} />
    </section>
  </AdminLayout>;
}

