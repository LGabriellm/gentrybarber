import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../components/admin-layout';
import { TenantStatus, type AdminPlan } from '../../../components/admin-data';
import { BarbershopForm, LocationManager, type BarbershopDetail } from './editor';
export const dynamic = 'force-dynamic';
export default async function BarbershopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, plans] = await Promise.all([apiGet<BarbershopDetail>(`/v1/admin/tenants/${encodeURIComponent(id)}`), apiGet<AdminPlan[]>('/v1/admin/plans')]);
  return <AdminLayout activeTab="tenants" title={tenant.name} description="Configure a barbearia e organize sua estrutura de atendimento." action={<a href="/tenants" className="button secondary">Voltar às barbearias</a>}>
    <div className="admin-detail-summary"><TenantStatus status={tenant.status} /><span>{tenant.plan.name}</span><span>{tenant.locations.length} unidades</span><span>{tenant._count.services} serviços</span><span>{tenant._count.professionals} profissionais</span></div>
    <nav className="admin-section-nav" aria-label="Seções da barbearia"><a href="#configuracao">Dados e configuração</a><a href="#unidades">Unidades</a><a href="#acessos">Pessoas com acesso</a><a href={`/tenants/${tenant.id}/website`}>Editar site</a></nav>
    <div className="admin-editor-stack"><BarbershopForm tenant={tenant} plans={plans.filter(plan => plan.active)} /><LocationManager tenant={tenant} />
      <section id="acessos" className="admin-panel"><div className="admin-panel-heading"><div><h2>Pessoas com acesso</h2><p>Contas vinculadas e suas funções nesta barbearia.</p></div></div>{tenant.memberships.length ? <ul className="admin-member-list">{tenant.memberships.map(member => <li key={member.id}><div><strong>{member.user.name}</strong><small>{member.user.email}</small></div><span>{member.role.name} · {member.status === 'ACTIVE' ? 'Ativo' : member.status === 'INVITED' ? 'Convidado' : 'Suspenso'}</span></li>)}</ul> : <p className="admin-empty">Nenhuma conta vinculada.</p>}</section>
    </div>
  </AdminLayout>;
}
