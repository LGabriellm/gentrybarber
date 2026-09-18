import { platformName } from '@platform/config';
import { apiGet } from '@platform/web-kit/server';
import { SignOutButton } from '@platform/web-kit/auth-form';
import type { ContextView, FeatureView } from '@platform/web-kit';
import type { LocationCatalog } from '@platform/types';
import { LocationManager } from '../../../../components/location-manager';
import { TenantNavigation } from '../../../../components/tenant-navigation';
import '../../../../components/catalog.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dados da barbearia' };
export default async function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = '/v1/tenants/' + encodeURIComponent(slug);
  const [context, features] = await Promise.all([apiGet<ContextView>(base + '/context'), apiGet<FeatureView[]>(base + '/features')]);
  const allowed = context.permissions.includes('team.manage');
  const data = allowed ? await apiGet<LocationCatalog>(base + '/locations') : null;
  const name = platformName();
  return <div className="shell catalog-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a><SignOutButton /></header>
    <main className="main">
      <a className="catalog-back" href={'/?tenant=' + encodeURIComponent(context.tenant.slug)}>← Voltar ao painel</a>
      <div className="intro"><span className="eyebrow">{context.tenant.name}</span><h1>Dados da barbearia</h1><p>Atualize nome, endereço e contato dos locais de atendimento.</p></div>
      <TenantNavigation context={context} features={features} />
      {data ? <LocationManager key={context.tenant.id} slug={context.tenant.slug} initialData={data} /> : <section className="panel"><h2>Acesso indisponível</h2><p>Seu acesso não permite gerenciar os dados da barbearia. Consulte o responsável pelo ambiente.</p></section>}
    </main>
    <footer className="footer"><span>{name} · Área da barbearia</span><span>{context.tenant.name}</span></footer>
  </div>;
}
