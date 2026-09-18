import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../../components/admin-layout';
import { WebsiteEditor, type WebsiteEditorData } from './editor';
export const dynamic = 'force-dynamic';
export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await apiGet<WebsiteEditorData>(`/v1/admin/tenants/${encodeURIComponent(id)}/website`);
  return <AdminLayout activeTab="tenants" title="Editor do site" description={`${data.data.tenant.name} · Gerencie os arquivos, a prévia e as versões do site.`} action={<a className="button secondary" href={`/tenants/${encodeURIComponent(id)}`}>Voltar à barbearia</a>}><WebsiteEditor key={`${id}:${data.latestId}:${data.status}:${data.publishedId}`} id={id} initial={data} /></AdminLayout>;
}
