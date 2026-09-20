import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../../../../components/admin-layout';
import { WebsiteEditor, type WebsiteEditorData } from './editor';
export const dynamic = 'force-dynamic';
export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await apiGet<WebsiteEditorData>(`/v1/admin/tenants/${encodeURIComponent(id)}/website`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('permissão')) {
      return (
        <AdminLayout activeTab="tenants" title="Editor do site" description="Recurso indisponível." action={<a className="button secondary" href={`/tenants/${encodeURIComponent(id)}`}>Voltar à barbearia</a>}>
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h2>Recurso não habilitado</h2>
                <p>A barbearia não possui o recurso de site ativado no plano atual.</p>
              </div>
            </div>
            <p className="admin-empty" style={{ padding: '2rem' }}>Altere o plano da barbearia para gerenciar a apresentação.</p>
          </section>
        </AdminLayout>
      );
    }
    throw error;
  }
  return <AdminLayout activeTab="tenants" title="Editor do site" description={`${data.data.tenant.name} · Gerencie os arquivos, a prévia e as versões do site.`} action={<a className="button secondary" href={`/tenants/${encodeURIComponent(id)}`}>Voltar à barbearia</a>}><WebsiteEditor key={`${id}:${data.latestId}:${data.status}:${data.publishedId}`} id={id} initial={data} /></AdminLayout>;
}
