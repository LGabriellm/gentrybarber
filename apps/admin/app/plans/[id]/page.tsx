import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../components/admin-layout';
import { EditPlanForm } from './form';
import { money, type AdminPlan } from '../../../components/admin-data';

export const dynamic = 'force-dynamic';
export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plans = await apiGet<AdminPlan[]>('/v1/admin/plans');
  const plan = plans.find(p => p.id === id);
  if (!plan) {
    return <AdminLayout activeTab="plans" title="Plano não encontrado" description="O plano solicitado não existe ou foi removido.">
      <section className="admin-panel admin-empty"><h2>Plano não encontrado</h2><p>Volte à lista de planos para continuar.</p><a href="/plans" className="button">Ver planos</a></section>
    </AdminLayout>;
  }
  return <AdminLayout activeTab="plans" title={plan.name} description="Edite as condições comerciais deste plano." action={<a href="/plans" className="button secondary">Voltar aos planos</a>}>
    <div className="admin-detail-summary">
      <span className={`admin-status ${plan.active ? '' : 'admin-status-muted'}`}>{plan.active ? 'Ativo' : 'Inativo'}</span>
      <span>{money(plan.monthlyPriceCents)}/mês</span>
      <span>Chave: {plan.key}</span>
    </div>
    <EditPlanForm plan={plan} />
  </AdminLayout>;
}
