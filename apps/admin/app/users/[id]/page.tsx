import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../components/admin-layout';
import { UserManager, type AdminUserDetail } from './editor';

export const dynamic = 'force-dynamic';
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await apiGet<AdminUserDetail>(`/v1/admin/users/${encodeURIComponent(id)}`);
  return <AdminLayout activeTab="users" title={user.name} description="Gerencie a identidade, a senha, as sessões e os acessos desta conta." action={<a href="/users" className="button secondary">Voltar aos usuários</a>}>
    <UserManager user={user} />
  </AdminLayout>;
}
