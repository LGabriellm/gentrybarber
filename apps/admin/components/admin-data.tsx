export interface AdminTenant { id: string; name: string; slug: string; status: string; createdAt: string; plan: { name: string }; memberships: { user: { name: string; email: string } }[] }
export interface AdminUser { id: string; name: string; email: string; emailVerified: boolean; platformRole: string; createdAt: string }
export interface AdminPlan { id: string; key: string; name: string; description: string | null; active: boolean; monthlyPriceCents: number; setupFeeCents: number; customDesignFeeCents: number }
export interface AdminPage<T> { items: T[]; total: number; page: number; pageSize: number }
export const count = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
export const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
const statuses: Record<string, string> = { ACTIVE: 'Ativa', TRIAL: 'Em avaliação', SUSPENDED: 'Suspensa', CANCELED: 'Encerrada' };
export function TenantStatus({ status }: { status: string }) { return <span className={`admin-status ${status === 'SUSPENDED' || status === 'TRIAL' ? 'admin-status-warning' : status !== 'ACTIVE' ? 'admin-status-muted' : ''}`}>{statuses[status] ?? status}</span>; }
export function TenantTable({ items, compact = false }: { items: AdminTenant[]; compact?: boolean }) {
  if (!items.length) return <div className="admin-empty"><h2>Nenhuma barbearia encontrada</h2><p>Revise os filtros ou cadastre o primeiro ambiente.</p></div>;
  return <table className="admin-table"><thead><tr><th scope="col">Barbearia</th>{!compact && <th scope="col">Responsável</th>}<th scope="col">Plano</th><th scope="col">Situação</th></tr></thead><tbody>{items.map(tenant => <tr key={tenant.id}><td><div className="admin-identity"><span className="admin-avatar" aria-hidden="true">{tenant.name.trim().slice(0, 2).toUpperCase()}</span><div><strong><a href={`/tenants/${tenant.id}`}>{tenant.name}</a></strong><small>{tenant.slug}</small><a href={`/tenants/${tenant.id}/website`}>Gerenciar site →</a></div></div></td>{!compact && <td data-label="Responsável"><span className="admin-owner">{tenant.memberships[0]?.user.name ?? 'Sem responsável ativo'}<small>{tenant.memberships[0]?.user.email}</small></span></td>}<td data-label="Plano">{tenant.plan.name}</td><td data-label="Situação"><TenantStatus status={tenant.status} /></td></tr>)}</tbody></table>;
}
export function Pagination({ page, total, pageSize, path, query }: { page: number; total: number; pageSize: number; path: string; query: URLSearchParams }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (next: number) => { const params = new URLSearchParams(query); params.set('page', String(next)); return `${path}?${params}`; };
  return <div className="admin-pagination"><span>{count(total)} registros · Página {page} de {pages}</span><nav aria-label="Paginação">{page > 1 && <a href={href(page - 1)}>← Anterior</a>}{page < pages && <a href={href(page + 1)}>Próxima →</a>}</nav></div>;
}
export function listQuery(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const key of ['q', 'status', 'page']) if (typeof params[key] === 'string' && params[key]) query.set(key, params[key]);
  return query;
}
