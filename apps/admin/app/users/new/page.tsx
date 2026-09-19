import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../components/admin-layout';
import { NewUserForm } from './form';
import type { AdminTenant, AdminPage } from '../../../components/admin-data';

export const dynamic = 'force-dynamic';
export default async function NewUserPage() {
  const data = await apiGet<AdminPage<AdminTenant>>('/v1/admin/tenants?page=1');
  const tenants = data.items.map(t => ({ slug: t.slug, name: t.name }));
  return <AdminLayout activeTab="users" title="Novo usuário" description="Crie uma nova conta de acesso para a plataforma.">
    <NewUserForm tenants={tenants} />
    <aside className="admin-note"><span aria-hidden="true">◈</span><div><strong>Como ativar o acesso?</strong><p>Se o e-mail for marcado como verificado, o usuário poderá definir sua senha pelo fluxo "Esqueci minha senha" e acessar imediatamente. Caso contrário, precisará verificar o e-mail antes do primeiro acesso.</p></div></aside>
  </AdminLayout>;
}
