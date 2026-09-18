import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../components/admin-layout';
import { NewTenantForm } from './form';
import type { AdminPlan } from '../../../components/admin-data';
export const dynamic = 'force-dynamic';
export default async function NewTenantPage() {
  const plans = (await apiGet<AdminPlan[]>('/v1/admin/plans')).filter(plan => plan.active);
  return <AdminLayout activeTab="tenants" title="Nova barbearia" description="Prepare um ambiente para uma nova operação. Os dados poderão ser consultados na lista de barbearias.">
    {!plans.length && <div className="admin-note"><p>Configure um plano ativo antes de cadastrar uma barbearia.</p></div>}
    <NewTenantForm plans={plans} />
  </AdminLayout>;
}
