import { TenantNavigation } from '../../../../components/tenant-navigation';
import { platformName } from '@platform/config';
import type { CustomerView } from '@platform/types';
import type { ContextView, FeatureView } from '@platform/web-kit';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { apiGet } from '@platform/web-kit/server';
import { CustomerManager } from '../../../../components/customer-manager';

async function CustomerPage({ slug }: { slug: string }) {
  const context = await apiGet<ContextView>(`/v1/tenants/${encodeURIComponent(slug)}/context`);
  const basePath = `/v1/tenants/${encodeURIComponent(context.tenant.slug)}`;
  const features = await apiGet<FeatureView[]>(`${basePath}/features`);
  const entitled = features.some(feature => feature.key === 'customers' && feature.enabled);
  const permitted = context.permissions.includes('customers.read');
  const allowed = entitled && permitted;
  const data = allowed ? await apiGet<{ items: CustomerView[] }>(`${basePath}/customers`) : null;
  const name = platformName();


  return <div className="shell catalog-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a><SignOutButton /></header>
    <main className="main">
      <a className="catalog-back" href={`/?tenant=${encodeURIComponent(context.tenant.slug)}`}>← Voltar ao painel</a>
      <div className="intro"><span className="eyebrow">{context.tenant.name}</span><h1>Clientes</h1><p>Gerencie sua base de clientes, edite contatos e registre anotações sobre preferências.</p></div>
      <TenantNavigation context={context} features={features} />
      {data ? <CustomerManager slug={context.tenant.slug} initialData={data} canUpdate={context.permissions.includes('customers.update')} /> : <section className="panel"><h2>Acesso indisponível</h2><p>{!permitted ? 'Seu acesso nesta barbearia não permite gerenciar clientes. Entre em contato com o responsável pelo ambiente.' : 'O recurso de gestão de clientes ainda não está habilitado para esta barbearia. Entre em contato com o responsável pelo ambiente.'}</p></section>}
    </main>
    <footer className="footer"><span>{name} · Área da barbearia</span><span>{context.tenant.name}</span></footer>
  </div>;
}

export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CustomerPage slug={slug} />;
}
