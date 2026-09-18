import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../components/admin-layout';
import { TenantTable, Pagination, listQuery, count, type AdminTenant, type AdminPage } from '../../components/admin-data';
export const dynamic = 'force-dynamic';
export default async function TenantsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = listQuery(await searchParams);
  const data = await apiGet<AdminPage<AdminTenant>>(`/v1/admin/tenants?${query}`);
  return <AdminLayout activeTab="tenants" title="Barbearias" description="Organize os ambientes e acompanhe os responsáveis, os planos e a situação de cada barbearia." action={<a href="/tenants/new" className="button"><span aria-hidden="true">＋</span> Nova barbearia</a>}>
    <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Todos os ambientes</h2><p>{count(data.total)} barbearias encontradas</p></div></div>
      <form className="admin-filters" action="/tenants"><label className="admin-filter-field">Buscar barbearia<input name="q" defaultValue={query.get('q') ?? ''} placeholder="Nome ou identificador da barbearia" maxLength={120} /></label><label className="admin-filter-field">Situação<select aria-label="Situação" name="status" defaultValue={query.get('status') ?? ''}><option value="">Todas as situações</option><option value="ACTIVE">Ativa</option><option value="TRIAL">Em avaliação</option><option value="SUSPENDED">Suspensa</option><option value="CANCELED">Encerrada</option></select></label><button className="button secondary" type="submit">Aplicar filtros</button>{query.size > 0 && <a href="/tenants">Limpar filtros</a>}</form>
      <TenantTable items={data.items} /><Pagination {...data} path="/tenants" query={query} />
    </section>
  </AdminLayout>;
}

