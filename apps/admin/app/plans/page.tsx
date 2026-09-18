import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../components/admin-layout';
import { money, type AdminPlan } from '../../components/admin-data';
export const dynamic = 'force-dynamic';
export default async function PlansPage() {
  const plans = await apiGet<AdminPlan[]>('/v1/admin/plans');
  return <AdminLayout activeTab="plans" title="Planos" description="Consulte os valores e as condições comerciais disponíveis para as barbearias." action={<a href="/plans/new" className="button"><span aria-hidden="true">＋</span> Novo plano</a>}>
    {plans.length ? <div className="admin-plan-grid">{plans.map(plan => <article className="admin-plan" key={plan.id}><span className={`admin-status ${plan.active ? '' : 'admin-status-muted'}`}>{plan.active ? 'Disponível para novos ambientes' : 'Indisponível para novos ambientes'}</span><h2>{plan.name}</h2><p>{plan.description || 'Plano configurado para a operação da plataforma.'}</p><div className="admin-plan-price">{money(plan.monthlyPriceCents)} <small>/ mês</small></div><dl><div><dt>Implantação</dt><dd>{money(plan.setupFeeCents)}</dd></div><div><dt>Design personalizado</dt><dd>{money(plan.customDesignFeeCents)}</dd></div></dl></article>)}</div> : <section className="admin-panel admin-empty"><h2>Nenhum plano configurado</h2><p>Configure um plano antes de cadastrar novas barbearias.</p></section>}
    <aside className="admin-note"><span aria-hidden="true">◈</span><div><strong>Condições comerciais cadastradas</strong><p>Esta tela permite consultar os planos. A cobrança automática e a edição de contratos serão disponibilizadas em uma próxima etapa.</p></div></aside>
  </AdminLayout>;
}
