import { AdminLayout } from '../../../components/admin-layout';
import { NewPlanForm } from './form';
import { apiGet } from '@platform/web-kit/server';
import type { AdminPlan } from '../../../components/admin-data';

export const dynamic = 'force-dynamic';
export default async function NewPlanPage() {
  const plans = await apiGet<AdminPlan[]>('/v1/admin/plans');
  return <AdminLayout activeTab="plans" title="Novo plano comercial" description="Crie um novo plano comercial para oferecer às barbearias.">
    <NewPlanForm plans={plans.filter(plan => plan.active).map(({ id, name }) => ({ id, name }))} />
    <aside className="admin-note"><span aria-hidden="true">◈</span><div><strong>Funcionalidades do plano</strong><p>Selecione um plano existente para copiar suas funcionalidades e limites. Sem essa composição, o novo plano fica indisponível para novas barbearias até ser configurado pela operação da plataforma.</p></div></aside>
  </AdminLayout>;
}
